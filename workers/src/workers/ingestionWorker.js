import { Worker } from "bullmq";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { connection, accumulationQueue, BACKEND_URL } from "../queues.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USE_MOCK = process.env.USE_MOCK === "true";
const MOCK_FILE = path.resolve(__dirname, "../../mock_livescore.json");

async function fetchEvents() {
  if (USE_MOCK) {
    const raw = fs.readFileSync(MOCK_FILE, "utf-8");
    return JSON.parse(raw).events || [];
  }
  const key = process.env.THESPORTSDB_API_KEY || "123";
  const today = new Date().toISOString().split("T")[0];
  const sports = ["Soccer", "Basketball", "Baseball"];
  let events = [];
  for (const sport of sports) {
    try {
      const { data } = await axios.get(
        `https://www.thesportsdb.com/api/v1/json/${key}/eventsday.php?d=${today}&s=${sport}`,
        { timeout: 8000 }
      );
      if (data?.events) events.push(...data.events);
    } catch (e) {
      console.warn(`TSDB fetch error for ${sport}: ${e.message}`);
    }
  }
  return events;
}

export function startIngestionWorker() {
  const worker = new Worker(
    "ingestion",
    async (job) => {
      console.log(`[Ingestion] Processing job ${job.id}`);
      const events = await fetchEvents();
      console.log(`[Ingestion] Fetched ${events.length} events`);

      for (const raw of events) {
        const eventId = String(raw.idEvent || "");
        if (!eventId) continue;

        // Notify Python backend to upsert event and update pipeline stage 1
        try {
          await axios.post(`${BACKEND_URL}/api/internal/ingest`, { event: raw }, { timeout: 5000 });
        } catch (e) {
          // Backend may not expose internal route — handled via scheduler
        }

        // Enqueue accumulation job for each event
        await accumulationQueue.add(
          "accumulate",
          { eventId, eventData: raw },
          {
            jobId: `accumulate-${eventId}-${Date.now()}`,
            attempts: 3,
            backoff: { type: "exponential", delay: 2000 },
          }
        );
      }

      return { count: events.length };
    },
    {
      connection,
      concurrency: 1,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 3000 },
      },
    }
  );

  worker.on("completed", (job, result) =>
    console.log(`[Ingestion] ✅ Job ${job.id} done — ${result.count} events`)
  );
  worker.on("failed", (job, err) =>
    console.error(`[Ingestion] ❌ Job ${job?.id} failed: ${err.message}`)
  );

  return worker;
}
