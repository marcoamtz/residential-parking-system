import { Redis, type RedisOptions } from "ioredis";
import { cacheRequests, logger } from "./observability";

/**
 * Cache-aside with a per-building version key (ADR-0005). Any failure degrades to a miss:
 * the cache is never required for correctness.
 */
export interface Cache {
  getVersion(buildingId: string): Promise<number>;
  bump(buildingId: string): Promise<void>;
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  /** Readiness probe. "unavailable" is informational, never a failure. */
  ping(): Promise<"ok" | "unavailable">;
}

/**
 * Fail-fast client for the cache. With Redis unreachable, ioredis would otherwise queue commands
 * and retry for tens of seconds per request; here a command fails within ~300 ms and the caller
 * falls through to PostgreSQL. Reconnection keeps backing off in the background.
 */
export function createCacheRedis(url: string, overrides: RedisOptions = {}): Redis {
  const redis = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    connectTimeout: 300,
    commandTimeout: 300,
    retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
    ...overrides,
  });
  // Surfaced once by RedisCache.guard; without a listener ioredis would throw on 'error'.
  redis.on("error", () => {});
  // Connect eagerly so the first request after startup is not a forced miss; failures retry in the background.
  redis.connect().catch(() => {});
  return redis;
}

export class RedisCache implements Cache {
  private warned = false;

  constructor(private readonly redis: Redis) {}

  async getVersion(buildingId: string): Promise<number> {
    const raw = await this.guard(() => this.redis.get(versionKey(buildingId)));
    return raw ? Number(raw) : 0;
  }

  async bump(buildingId: string): Promise<void> {
    await this.guard(() => this.redis.incr(versionKey(buildingId)));
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.guard(() => this.redis.get(key));
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.guard(() => this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds));
  }

  async ping(): Promise<"ok" | "unavailable"> {
    try {
      return (await this.redis.ping()) === "PONG" ? "ok" : "unavailable";
    } catch {
      return "unavailable";
    }
  }

  private async guard<T>(operation: () => Promise<T>): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      if (!this.warned) {
        this.warned = true;
        logger.warn({ err: error }, "cache unavailable, serving from database");
      }
      return null;
    }
  }
}

/** No-op cache for tests and for running without Redis. */
export class NullCache implements Cache {
  async getVersion(): Promise<number> {
    return 0;
  }
  async bump(): Promise<void> {}
  async get<T>(): Promise<T | null> {
    return null;
  }
  async set(): Promise<void> {}
  async ping(): Promise<"ok" | "unavailable"> {
    return "unavailable";
  }
}

function versionKey(buildingId: string): string {
  return `building:${buildingId}:version`;
}

/** Read through the cache under the building's current version. */
export async function withCache<T>(
  cache: Cache,
  buildingId: string,
  name: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  const version = await cache.getVersion(buildingId);
  const key = `building:${buildingId}:v${version}:${name}`;
  const hit = await cache.get<T>(key);
  cacheRequests.inc({ result: hit !== null ? "hit" : "miss" });
  if (hit !== null) return hit;
  const value = await load();
  await cache.set(key, value, ttlSeconds);
  return value;
}
