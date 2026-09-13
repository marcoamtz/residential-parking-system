import { createDb } from "@parking/db";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { RedisCache } from "../cache";
import { toIsoDate } from "../deps";
import { loadDotenv, loadEnv } from "../env";
import { rotateAllBuildings } from "./rotation";

/**
 * Quarterly rotation worker (ADR-0012). Two modes:
 *
 *   node dist/scheduler.js          long-running: a BullMQ repeatable job fires on ROTATION_CRON
 *   node dist/scheduler.js --once   run the rotation now and exit (platform cron, manual catch-up)
 *
 * Both call the same rotateAllBuildings(), which reuses the administrator's draw and cycle code.
 */
loadDotenv();
const env = loadEnv();
const once = process.argv.includes("--once");

const { db, pool } = createDb(env.DATABASE_URL);
// BullMQ needs maxRetriesPerRequest: null on its connections; the cache client keeps the default.
const cacheRedis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
cacheRedis.on("error", () => {});
const cache = new RedisCache(cacheRedis);

const rotate = () => rotateAllBuildings(db, cache, toIsoDate(new Date()), env.DRAW_LEAD_DAYS);

if (once) {
  const results = await rotate();
  for (const r of results) {
    console.log(
      `building ${r.buildingId}: ${r.actions.length === 0 ? "no action" : JSON.stringify(r.actions)}`,
    );
  }
  await Promise.allSettled([pool.end(), cacheRedis.quit()]);
  process.exit(0);
}

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue("rotation", { connection });
await queue.upsertJobScheduler(
  "daily-rotation",
  { pattern: env.ROTATION_CRON, tz: "UTC" },
  { name: "rotate" },
);

const worker = new Worker("rotation", rotate, { connection });
worker.on("completed", (job, results: Awaited<ReturnType<typeof rotate>>) => {
  const acted = results.filter((r) => r.actions.length > 0);
  console.log(`rotation ${job.id}: ${results.length} buildings checked, ${acted.length} changed`);
  for (const r of acted) console.log(`  building ${r.buildingId}: ${JSON.stringify(r.actions)}`);
});
worker.on("failed", (job, error) => {
  console.error(`rotation ${job?.id ?? "?"} failed`, error);
});
console.log(
  `rotation scheduler running (cron "${env.ROTATION_CRON}" UTC, lead ${env.DRAW_LEAD_DAYS} days)`,
);

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  await worker.close();
  await queue.close();
  await Promise.allSettled([connection.quit(), cacheRedis.quit(), pool.end()]);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
