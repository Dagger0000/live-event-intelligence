import { Worker } from "bullmq";
import axios from "axios";
import { connection, commentaryQueue, BACKEND_URL } from "../queues.js";

export function startAccumulationWorker() {
  const worker = new Worker(
    "accumulation",
    async (job) => {
      const { eventId, eventData } = job.data;
      console.log(`[Accumulation] Stage 2 — event ${eventId}`);

      // POST stream entry to Python backend (which handles the 50-row window)
      try {
        await axios.post(
          `${BACKEND_URL}/api/internal/stream`,
          { event_id: eventId, event_data: eventData },
          { timeout: 5000 }
        );
      } catch (e) {
        console.warn(`[Accumulation] Backend stream post failed: ${e.message}`);
      }

      // Enqueue Groq commentary job
      await commentaryQueue.add(
        "commentary",
        { eventId, eventData },
        {
          jobId: `commentary-${eventId}-${Date.now()}`,
          attempts: 2,
          backoff: { type: "fixed", delay: 1000 },
          priority: 1, // high priority — target <2s
        }
      );

      return { eventId };
    },
    {
      connection,
      concurrency: 10, // process many events in parallel
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    }
  );

  worker.on("completed", (job) =>
    console.log(`[Accumulation] ✅ ${job.data.eventId}`)
  );
  worker.on("failed", (job, err) =>
    console.error(`[Accumulation] ❌ ${job?.data?.eventId}: ${err.message}`)
  );

  return worker;
}
