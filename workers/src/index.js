import express from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter.js";
import { ExpressAdapter } from "@bull-board/express";
import {
  allQueues,
  ingestionQueue,
  analysisQueue,
  connection,
} from "./queues.js";
import { startIngestionWorker } from "./workers/ingestionWorker.js";
import { startAccumulationWorker } from "./workers/accumulationWorker.js";
import { startCommentaryWorker } from "./workers/commentaryWorker.js";
import { startAnalysisWorker } from "./workers/analysisWorker.js";
import { startAlertWorker } from "./workers/alertWorker.js";
import { startReportWorker } from "./workers/reportWorker.js";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

// ── Start all workers ─────────────────────────────────────────────────────────
console.log("🚀 Starting BullMQ workers...");
const workers = [
  startIngestionWorker(),
  startAccumulationWorker(),
  startCommentaryWorker(),
  startAnalysisWorker(),
  startAlertWorker(),
  startReportWorker(),
];
console.log(`✅ ${workers.length} workers started`);

// ── Bull Board (visual queue dashboard) ───────────────────────────────────────
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: allQueues.map((q) => new BullMQAdapter(q)),
  serverAdapter,
});

const app = express();
app.use(express.json());
app.use("/admin/queues", serverAdapter.getRouter());
app.get("/health", (_, res) => res.json({ status: "ok", workers: workers.length }));

// ── Failed jobs API — powers the BullMQ Retry Dashboard ──────────────────────
app.get("/api/failed-jobs", async (req, res) => {
  try {
    const results = [];
    for (const queue of allQueues) {
      const failed = await queue.getFailed(0, 50);
      for (const job of failed) {
        results.push({
          id: job.id,
          queue: queue.name,
          name: job.name,
          attempts: job.attemptsMade,
          maxAttempts: job.opts?.attempts || 1,
          error: job.failedReason || "Unknown error",
          lastAttempt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
          timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : null,
          data: job.data,
        });
      }
    }
    results.sort((a, b) => new Date(b.lastAttempt) - new Date(a.lastAttempt));
    res.json({ failed: results, total: results.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Retry a specific job ──────────────────────────────────────────────────────
app.post("/api/retry-job", async (req, res) => {
  const { queue: queueName, jobId } = req.body;
  try {
    const queue = allQueues.find(q => q.name === queueName);
    if (!queue) return res.status(404).json({ error: "Queue not found" });
    const job = await queue.getJob(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    await job.retry();
    res.json({ success: true, message: `Job ${jobId} requeued` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.WORKER_PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Bull Board: http://localhost:${PORT}/admin/queues`);
});

// ── APScheduler-equivalent: JS setInterval job enqueuer ──────────────────────
async function enqueueIngestion() {
  try {
    await ingestionQueue.add(
      "ingest-all",
      {},
      {
        jobId: `ingest-${Date.now()}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      }
    );
    console.log(`[Scheduler] ✅ Ingestion job enqueued at ${new Date().toISOString()}`);
  } catch (e) {
    console.error("[Scheduler] Ingestion enqueue failed:", e.message);
  }
}

async function enqueueAnalysis() {
  try {
    // Fetch active events from backend to enqueue analysis jobs
    const { data } = await axios.get(`${BACKEND_URL}/api/internal/active-events`, {
      timeout: 5000,
    });
    const events = data?.events || [];
    for (const event of events) {
      await analysisQueue.add(
        "analyze",
        { eventId: event.id, eventStatus: event.status },
        {
          jobId: `analysis-${event.id}-${Math.floor(Date.now() / 300000)}`, // 5-min bucket dedup
          attempts: 2,
          backoff: { type: "exponential", delay: 10000 },
        }
      );
    }
    if (events.length > 0) {
      console.log(`[Scheduler] ✅ Analysis jobs enqueued for ${events.length} active events`);
    }
  } catch (e) {
    console.warn("[Scheduler] Analysis enqueue skipped:", e.message);
  }
}

// Run immediately on boot, then on interval
enqueueIngestion();
setInterval(enqueueIngestion, 60_000);  // every 60s — Stage 1

setTimeout(() => {
  enqueueAnalysis();
  setInterval(enqueueAnalysis, 5 * 60_000); // every 5 min — Stage 4
}, 15_000); // wait 15s for backend to be ready

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown() {
  console.log("\n🛑 Shutting down workers...");
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
