import { Worker } from "bullmq";
import axios from "axios";
import { connection, BACKEND_URL } from "../queues.js";

// In-memory debounce map: eventId -> lastCommentaryTimestamp
//
// NOTE ON DEBOUNCE ARCHITECTURE:
// This in-memory Map is a BEST-EFFORT fast-path guard only. It resets on every
// worker restart, which means a restart during an active polling cycle could
// theoretically allow multiple Groq calls for the same event before the Map
// repopulates. The AUTHORITATIVE debounce gate is the `last_commentary_at`
// timestamp column checked inside the Python backend (/api/internal/commentary).
// The backend will return { skipped: true } if the 60s window hasn't elapsed.
//
// IMPORTANT: This worker must ALWAYS call the backend when the in-memory check
// passes — it must never skip the backend call itself. Only the backend can
// make the final debounce decision because it has persistent DB state.
const lastCommentaryAt = new Map();
const DEBOUNCE_MS = 60_000; // 60 seconds — mirrors backend's last_commentary_at check

export function startCommentaryWorker() {
  const worker = new Worker(
    "commentary",
    async (job) => {
      const { eventId, eventData } = job.data;

      // Debounce check
      const last = lastCommentaryAt.get(eventId);
      if (last && Date.now() - last < DEBOUNCE_MS) {
        console.log(`[Commentary] ⏭  Skipping ${eventId} — debounced`);
        return { skipped: true, eventId };
      }

      console.log(`[Commentary] Stage 3 — calling Groq for event ${eventId}`);
      const start = Date.now();

      try {
        // Trigger Python backend to call Groq and push via WebSocket
        const { data } = await axios.post(
          `${BACKEND_URL}/api/internal/commentary`,
          { event_id: eventId, event_data: eventData },
          { timeout: 4000 } // must be <2s on Groq side, 4s total with network
        );

        const latency = Date.now() - start;
        lastCommentaryAt.set(eventId, Date.now());
        console.log(`[Commentary] ✅ ${eventId} — ${latency}ms — "${data?.commentary?.slice(0, 60)}..."`);
        return { eventId, latency, commentary: data?.commentary };
      } catch (e) {
        console.error(`[Commentary] ❌ ${eventId}: ${e.message}`);
        throw e; // triggers BullMQ retry
      }
    },
    {
      connection,
      concurrency: 5,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "fixed", delay: 500 },
      },
    }
  );

  worker.on("completed", (job, result) => {
    if (!result?.skipped) {
      console.log(`[Commentary] ✅ Job ${job.id} completed in ${result?.latency}ms`);
    }
  });
  worker.on("failed", (job, err) =>
    console.error(`[Commentary] ❌ Job ${job?.id} failed: ${err.message}`)
  );

  return worker;
}
