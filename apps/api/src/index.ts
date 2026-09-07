import { serve } from "@hono/node-server";
import { createDb } from "@parking/db";
import { Redis } from "ioredis";
import { createApp } from "./app";
import { RedisCache } from "./cache";
import { loadDotenv, loadEnv } from "./env";

loadDotenv();
const env = loadEnv();

const { db, pool } = createDb(env.DATABASE_URL);
const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
redis.on("error", () => {
  // Surfaced once by RedisCache; the API keeps serving from PostgreSQL.
});

const app = createApp({
  db,
  cache: new RedisCache(redis),
  jwtSecret: env.JWT_SECRET,
  cookieSecure: env.cookieSecure,
  mockAuth: env.mockAuth,
  now: () => new Date(),
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port} (mock auth: ${env.mockAuth})`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close();
  await Promise.allSettled([pool.end(), redis.quit()]);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
