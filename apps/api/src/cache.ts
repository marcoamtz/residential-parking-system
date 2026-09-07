import type { Redis } from "ioredis";

/**
 * Cache-aside with a per-building version key (ADR-0005). Any failure degrades to a miss:
 * the cache is never required for correctness.
 */
export interface Cache {
  getVersion(buildingId: string): Promise<number>;
  bump(buildingId: string): Promise<void>;
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
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

  private async guard<T>(operation: () => Promise<T>): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      if (!this.warned) {
        this.warned = true;
        console.warn("cache unavailable, serving from database", error);
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
  if (hit !== null) return hit;
  const value = await load();
  await cache.set(key, value, ttlSeconds);
  return value;
}
