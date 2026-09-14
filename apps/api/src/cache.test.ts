import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Cache, createCacheRedis, NullCache, RedisCache, withCache } from "./cache";

/** In-memory Cache with the same semantics as RedisCache, for unit-testing withCache. */
class MemoryCache implements Cache {
  versions = new Map<string, number>();
  store = new Map<string, unknown>();
  async getVersion(buildingId: string) {
    return this.versions.get(buildingId) ?? 0;
  }
  async bump(buildingId: string) {
    this.versions.set(buildingId, (await this.getVersion(buildingId)) + 1);
  }
  async get<T>(key: string) {
    return (this.store.get(key) as T | undefined) ?? null;
  }
  async set(key: string, value: unknown) {
    this.store.set(key, value);
  }
  async ping() {
    return "ok" as const;
  }
}

describe("withCache", () => {
  it("loads on a miss, serves the cached value on a hit, and misses again after a bump", async () => {
    const cache = new MemoryCache();
    const load = vi.fn().mockResolvedValueOnce({ v: 1 }).mockResolvedValueOnce({ v: 2 });

    expect(await withCache(cache, "b", "status", 60, load)).toEqual({ v: 1 });
    expect(await withCache(cache, "b", "status", 60, load)).toEqual({ v: 1 });
    expect(load).toHaveBeenCalledTimes(1);

    await cache.bump("b");
    expect(await withCache(cache, "b", "status", 60, load)).toEqual({ v: 2 });
    expect(load).toHaveBeenCalledTimes(2);
    expect([...cache.store.keys()]).toEqual(["building:b:v0:status", "building:b:v1:status"]);
  });

  it("keeps buildings independent: bumping one does not invalidate another", async () => {
    const cache = new MemoryCache();
    const load = vi.fn().mockResolvedValue("x");
    await withCache(cache, "a", "status", 60, load);
    await withCache(cache, "b", "status", 60, load);
    await cache.bump("a");
    await withCache(cache, "b", "status", 60, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("always loads with the NullCache", async () => {
    const load = vi.fn().mockResolvedValue("x");
    await withCache(new NullCache(), "b", "status", 60, load);
    await withCache(new NullCache(), "b", "status", 60, load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("RedisCache against Redis", () => {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const redis = createCacheRedis(url);
  const cache = new RedisCache(redis);
  const building = `test-${Date.now()}`;
  beforeAll(async () => {
    // The factory connects eagerly and refuses to queue commands; wait for the socket before testing.
    if (redis.status !== "ready") {
      await new Promise<void>((resolve, reject) => {
        redis.once("ready", () => resolve());
        setTimeout(() => reject(new Error("redis not ready in time")), 3_000);
      });
    }
  });
  afterAll(async () => {
    const keys = await redis.keys(`building:${building}:*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
  });

  it("stores under the version key and makes old keys unreachable after a bump", async () => {
    const load = vi.fn().mockResolvedValueOnce({ n: 1 }).mockResolvedValueOnce({ n: 2 });

    expect(await withCache(cache, building, "status", 60, load)).toEqual({ n: 1 });
    expect(await withCache(cache, building, "status", 60, load)).toEqual({ n: 1 });
    expect(await redis.get(`building:${building}:v0:status`)).toBe(JSON.stringify({ n: 1 }));

    await cache.bump(building);
    expect(await cache.getVersion(building)).toBe(1);
    expect(await withCache(cache, building, "status", 60, load)).toEqual({ n: 2 });
    expect(await redis.ttl(`building:${building}:v1:status`)).toBeGreaterThan(0);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reports ready", async () => {
    expect(await cache.ping()).toBe("ok");
  });
});

describe("RedisCache with Redis unreachable", () => {
  // Nothing listens here; connection attempts are refused immediately or time out at 300 ms.
  const redis = createCacheRedis("redis://127.0.0.1:6399");
  const cache = new RedisCache(redis);
  afterAll(() => redis.disconnect());

  it("falls through to the loader within a bounded time and reports unavailable", async () => {
    const load = vi.fn().mockResolvedValue({ fresh: true });
    const started = performance.now();

    const value = await withCache(cache, "b", "status", 60, load);
    const ready = await cache.ping();

    const elapsed = performance.now() - started;
    expect(value).toEqual({ fresh: true });
    expect(ready).toBe("unavailable");
    expect(elapsed).toBeLessThan(2_000);
  });

  it("does not throw from bump", async () => {
    await expect(cache.bump("b")).resolves.toBeUndefined();
  });
});
