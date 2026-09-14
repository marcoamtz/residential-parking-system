# ADR-0005: Redis cache-aside with a version key

Status: Accepted, 2026-09-06

## Context

The brief requires caching for frequently accessed data. In this domain, that is a resident's status page: current allocation, next cycle dates, and whether they have registered. The realistic read profile is a spike right after a draw is announced, when most residents open the app within the same hour.

At the scale of one building, PostgreSQL alone would serve this without difficulty. The cache exists because the brief asks for it and because the invalidation pattern must be right before multiple buildings share one deployment.

## Decision

Cache-aside in Redis for the resident status response, keyed by a per-building data version:

- `building:{id}:version` is an integer. Any write that changes what residents see (registration, draw, spot change) runs `INCR` on it after the database transaction commits.
- The status cache key is `building:{id}:v{version}:s{schema}:resident:{residentId}:status` with a short TTL as a safety net; `schema` is a constant bumped when the payload shape changes.
- A read fetches the version, builds the key, and falls back to the database on a miss.

Because a write bumps the version, every existing key for that building becomes unreachable at once. Old keys expire on their own. No `SCAN`, no key registry, no pub/sub.

## Consequences

- One extra Redis round trip per read to fetch the version, sequential with the value lookup because the key depends on it. Two sub-millisecond reads on a local network; not worth a Lua script or a server-side lookup at this scale.
- Invalidation is coarse: one registration invalidates every resident's cached status in that building. Acceptable because reads are cheap to rebuild and writes are rare.
- If Redis is unavailable the API reads from PostgreSQL. The cache is never required for correctness (see ADR-0004). The client is configured to fail fast (no offline queue, 300 ms connect and command timeouts), so an outage costs a few hundred milliseconds per read, not the tens of seconds ioredis defaults would allow; verified by a test against an unreachable port.
- Redis is also the natural home for a future job queue and for buffering camera events (ADR-0009), so the dependency earns its place beyond caching.

## Alternatives considered

- TTL only, no invalidation: residents would see stale status for the TTL right after a draw, which is exactly when they look.
- Delete specific keys on write: requires knowing every affected key, or scanning. Fragile as the number of cached views grows.
- HTTP caching headers only: does not help when every resident's page is different.

## Amendment, 2026-09-14: fail fast, then bypass

An independent review measured reads of 16–30 seconds with Redis stopped: ioredis queued commands offline and retried. The client now refuses to queue, times out connects and commands at 300 ms, and connects eagerly; the consequences above were reworded in place on the same day (commit b1d8d9a). A second review then measured 934 ms against a stalled server: each of the three commands in a read (version, value, write-back) timed out in turn. After one failed command the cache is now bypassed for one second, so a request pays for one timeout at most and a stalled server costs about 300 ms once per second. The key also carries a payload schema constant, so a deploy that changes the cached shape never serves entries written by the previous release for the rest of their TTL. Tests: `apps/api/src/cache.test.ts` (unreachable port, stalled client).
