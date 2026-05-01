import { Worker } from "bullmq";
import axios from "axios";
import { connection, alertQueue, reportQueue, BACKEND_URL } from "../queues.js";

// Redis TTL lock key pattern: analysis:lock:{eventId}
const ANALYSIS_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const lastAnalysisAt = new Map();

export function startAnalysisWorker() {
  const worker = new Worker(
    "analysis",
    async (job) => {
      const { eventId, eventStatus } = job.data;

      // Cooldown check
      const last = lastAnalysisAt.get(eventId);
      if (last && Date.now() - last < ANALYSIS_COOLDOWN_MS) {
        console.log(`[Analysis] ⏭  Skipping ${eventId} — cooldown active`);
        return { skipped: true };
      }

      console.log(`[Analysis] Stage 4 — Gemini deep analysis for ${eventId}`);

      try {
        const { data } = await axios.post(
          `${BACKEND_URL}/api/internal/analysis`,
          { event_id: eventId },
          { timeout: 30_000 } // Gemini can take up to 15s
        );

        lastAnalysisAt.set(eventId, Date.now());

        // Enqueue alert rule evaluation (Stage 7)
        await alertQueue.add(
          "evaluate-alerts",
          { eventId, analysis: data?.analysis },
          {
            jobId: `alerts-${eventId}-${Date.now()}`,
            attempts: 2,
            backoff: { type: "fixed", delay: 1000 },
          }
        );

        // If event is final, enqueue post-event report (Stage 8)
        if (eventStatus === "Final") {
          await reportQueue.add(
            "generate-report",
            { eventId },
            {
              jobId: `report-${eventId}`, // deduplication — only one report per event
              attempts: 2,
              backoff: { type: "exponential", delay: 5000 },
            }
          );
        }

        console.log(`[Analysis] ✅ ${eventId} — trend: ${data?.analysis?.trend}`);
        return { eventId, trend: data?.analysis?.trend };
      } catch (e) {
        console.error(`[Analysis] ❌ ${eventId}: ${e.message}`);
        throw e;
      }
    },
    {
      connection,
      concurrency: 3, // limit to avoid Gemini rate limit (15 req/min)
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 10_000 },
      },
    }
  );

  worker.on("completed", (job, result) => {
    if (!result?.skipped) console.log(`[Analysis] ✅ Job ${job.id} done`);
  });
  worker.on("failed", (job, err) =>
    console.error(`[Analysis] ❌ Job ${job?.id}: ${err.message}`)
  );

  return worker;
}
