import { Redis, type RedisOptions } from "ioredis";
import { describeError } from "./errors";
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

/** After one failed command the cache is skipped for this long, so one request pays for one timeout. */
const BYPASS_AFTER_FAILURE_MS = 1_000;

export class RedisCache implements Cache {
  private warned = false;
  private bypassUntil = 0;

  constructor(
    private readonly redis: Redis,
    private readonly now: () => number = Date.now,
  ) {}

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
    if (this.now() < this.bypassUntil) return null;
    try {
      return await operation();
    } catch (error) {
      // A stalled server times out every command; without this, a read would wait for the version,
      // the value, and the write-back in turn. Bypass briefly, then probe again.
      this.bypassUntil = this.now() + BYPASS_AFTER_FAILURE_MS;
      if (!this.warned) {
        this.warned = true;
        logger.warn({ err: describeError(error) }, "cache unavailable, serving from database");
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

/**
 * Bump when the shape of a cached payload changes, so entries written by the previous release are
 * unreachable after a deploy instead of served for up to the TTL.
 */
export const CACHE_SCHEMA = 2;

/** Read through the cache under the building's current version and the payload schema. */
export async function withCache<T>(
  cache: Cache,
  buildingId: string,
  name: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  const version = await cache.getVersion(buildingId);
  const key = `building:${buildingId}:v${version}:s${CACHE_SCHEMA}:${name}`;
  const hit = await cache.get<T>(key);
  cacheRequests.inc({ result: hit !== null ? "hit" : "miss" });
  if (hit !== null) return hit;
  const value = await load();
  await cache.set(key, value, ttlSeconds);
  return value;
}
