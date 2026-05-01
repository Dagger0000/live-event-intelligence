import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on("connect", () => console.log("✅ Redis connected"));
connection.on("error", (e) => console.error("❌ Redis error:", e.message));

// ── Queue definitions ─────────────────────────────────────────────────────────
export const ingestionQueue      = new Queue("ingestion",      { connection });
export const accumulationQueue   = new Queue("accumulation",   { connection });
export const commentaryQueue     = new Queue("commentary",     { connection });
export const analysisQueue       = new Queue("analysis",       { connection });
export const alertQueue          = new Queue("alert-rules",    { connection });
export const reportQueue         = new Queue("report",         { connection });

export const allQueues = [
  ingestionQueue,
  accumulationQueue,
  commentaryQueue,
  analysisQueue,
  alertQueue,
  reportQueue,
];

export const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
