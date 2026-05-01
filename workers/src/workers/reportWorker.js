import { Worker } from "bullmq";
import axios from "axios";
import { connection, BACKEND_URL } from "../queues.js";

export function startReportWorker() {
  const worker = new Worker(
    "report",
    async (job) => {
      const { eventId } = job.data;
      console.log(`[Report] Stage 8 — generating post-event report for ${eventId}`);

      try {
        const { data } = await axios.post(
          `${BACKEND_URL}/api/internal/report`,
          { event_id: eventId },
          { timeout: 45_000 } // reports can take longer
        );
        console.log(`[Report] ✅ ${eventId} — accuracy: ${data?.prediction_accuracy}`);
        return { eventId, accuracy: data?.prediction_accuracy };
      } catch (e) {
        // If 409 (report already exists), don't retry
        if (e?.response?.status === 409) {
          console.log(`[Report] ⏭  ${eventId} — report already exists`);
          return { skipped: true };
        }
        console.error(`[Report] ❌ ${eventId}: ${e.message}`);
        throw e;
      }
    },
    {
      connection,
      concurrency: 2,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 15_000 },
      },
    }
  );

  worker.on("completed", (job, result) => {
    if (!result?.skipped) console.log(`[Report] ✅ Job ${job.id} complete`);
  });
  worker.on("failed", (job, err) =>
    console.error(`[Report] ❌ Job ${job?.id}: ${err.message}`)
  );

  return worker;
}
