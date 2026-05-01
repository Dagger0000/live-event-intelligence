import { Worker } from "bullmq";
import axios from "axios";
import { connection, BACKEND_URL } from "../queues.js";

export function startAlertWorker() {
  const worker = new Worker(
    "alert-rules",
    async (job) => {
      const { eventId, analysis } = job.data;
      console.log(`[AlertRules] Stage 7 — evaluating rules for ${eventId}`);

      try {
        const { data } = await axios.post(
          `${BACKEND_URL}/api/internal/evaluate-alerts`,
          { event_id: eventId, analysis },
          { timeout: 10_000 }
        );
        console.log(`[AlertRules] ✅ ${eventId} — ${data?.triggered_count ?? 0} alerts fired`);
        return { eventId, triggeredCount: data?.triggered_count };
      } catch (e) {
        console.error(`[AlertRules] ❌ ${eventId}: ${e.message}`);
        throw e;
      }
    },
    {
      connection,
      concurrency: 5,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "fixed", delay: 2000 },
      },
    }
  );

  worker.on("completed", (job) =>
    console.log(`[AlertRules] ✅ Job ${job.id} done`)
  );
  worker.on("failed", (job, err) =>
    console.error(`[AlertRules] ❌ Job ${job?.id}: ${err.message}`)
  );

  return worker;
}
