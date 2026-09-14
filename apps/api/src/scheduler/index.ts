import { createDb } from "@parking/db";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { createCacheRedis, RedisCache } from "../cache";
import { toIsoDate } from "../deps";
import { loadDotenv, loadEnv } from "../env";
import { describeError } from "../errors";
import { logger } from "../observability";
import { assertRotationSucceeded, rotateAllBuildings } from "./rotation";

/**
 * Quarterly rotation worker (ADR-0012). Two modes:
 *
 *   node dist/scheduler.js          long-running: a BullMQ repeatable job fires on ROTATION_CRON
 *   node dist/scheduler.js --once   run the rotation now and exit (platform cron, manual catch-up)
 *
 * Both call the same rotateAllBuildings(), which reuses the administrator's draw and cycle code.
 * A building that fails is logged and skipped; every other building still runs, and the run as a
 * whole then fails (exit 1, or a failed BullMQ job) so the platform's alerting sees it.
 */
loadDotenv();
const env = loadEnv();
const once = process.argv.includes("--once");

const { db, pool } = createDb(env.DATABASE_URL);
// BullMQ needs maxRetriesPerRequest: null on its connections; the cache client keeps the default.
const cacheRedis = createCacheRedis(env.REDIS_URL);
const cache = new RedisCache(cacheRedis);

const rotate = async () => {
  const results = await rotateAllBuildings(db, cache, toIsoDate(new Date()), env.DRAW_LEAD_DAYS);
  assertRotationSucceeded(results);
  return results;
};

if (once) {
  let failed = false;
  try {
    const results = await rotate();
    for (const r of results) {
      logger.info({ buildingId: r.buildingId, actions: r.actions }, "rotation checked");
    }
  } catch (error) {
    // Per-building details were already logged by rotateAllBuildings.
    logger.error({ err: describeError(error) }, "rotation run failed");
    failed = true;
  }
  await Promise.allSettled([pool.end(), cacheRedis.quit()]);
  process.exit(failed ? 1 : 0);
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
  logger.info(
    {
      jobId: job.id,
      checked: results.length,
      changed: acted.map((r) => ({ buildingId: r.buildingId, actions: r.actions })),
    },
    "rotation completed",
  );
});
worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, err: describeError(error) }, "rotation failed");
});
logger.info(
  { cron: env.ROTATION_CRON, leadDays: env.DRAW_LEAD_DAYS },
  "rotation scheduler running",
);

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  await worker.close();
  await queue.close();
  await Promise.allSettled([connection.quit(), cacheRedis.quit(), pool.end()]);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
