import { serve } from "@hono/node-server";
import { createDb } from "@parking/db";
import { createApp } from "./app";
import { createCacheRedis, RedisCache } from "./cache";
import { loadDotenv, loadEnv } from "./env";
import { logger } from "./observability";

loadDotenv();
const env = loadEnv();
if (env.NODE_ENV === "production" && env.mockAuth) {
  logger.warn(
    "MOCK_AUTH=true in production: the password-less login is enabled. Intended for rehearsals only.",
  );
}

const { db, pool } = createDb(env.DATABASE_URL);
const redis = createCacheRedis(env.REDIS_URL);

const app = createApp({
  db,
  cache: new RedisCache(redis),
  jwtSecret: env.JWT_SECRET,
  cookieSecure: env.cookieSecure,
  mockAuth: env.mockAuth,
  now: () => new Date(),
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port, mockAuth: env.mockAuth }, "api listening");
});

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  server.close();
  await Promise.allSettled([pool.end(), redis.quit()]);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
