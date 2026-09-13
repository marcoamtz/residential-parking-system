# API

Base path `/api`. JSON in and out. Route definitions in `apps/api/src` are the source of truth; the web client imports their types, so this page describes rules and shape, not every field.

## Conventions

- Every input is validated with Zod before a handler runs. Invalid input returns `400` with code `validation_error` and an `issues` list of `{ path, message }`.
- Errors are `{ "code": string, "message": string }`. Codes are stable identifiers such as `already_registered` or `cycle_already_drawn`; messages are for humans.
- Sessions are a signed JWT in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie ([ADR-0008](adr/0008-mock-auth-jwt-cookie-rbac.md)). Missing or invalid session returns `401`; wrong role returns `403`.
- Every mutating request (anything but `GET`, `HEAD`, `OPTIONS`) must carry `X-Requested-With: parking-web`. Requests without it get `403`. Browsers only send custom headers from same-origin script, which is the second CSRF layer next to the cookie.
- Resident routes resolve the resident from the session claims. No resident route accepts a resident id as a parameter or in a body.
- Admin routes scope every query to the administrator's `buildingId` from the session. A cycle or spot in another building behaves as if it did not exist (`404`).

## Endpoints

### Health and operations

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | Liveness: the process is up. Never touches a dependency. Container health checks use this. No auth. |
| GET | `/api/ready` | Readiness: `200` when PostgreSQL answers `select 1`, `503` otherwise. Redis is reported in `checks` but never fatal (the cache is not required for correctness). Load balancers route on this. No auth. |
| GET | `/api/metrics` | Prometheus text format: `http_requests_total`, `http_request_duration_seconds` (by method and matched route), `cache_requests_total{result}`, `draw_duration_seconds`, Node.js defaults. Scraped inside the network; not routed by the load balancer. |

Every response carries `X-Request-Id`, taken from the incoming header when a proxy sets one (nginx and the load balancer do) or generated. Each request produces one JSON log line with that id, method, matched route, status, and duration; never a body, query string, or cookie.

### Auth

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/api/auth/me` | session | Current session claims. |
| POST | `/api/auth/logout` | none | Clears the cookie. `204`. |
| GET | `/api/auth/dev-users` | none | Development only (`MOCK_AUTH`). Lists seeded sign-in choices. `404` in production. |
| POST | `/api/auth/login` | none | Development only. Body `{ email }`. Issues the session cookie. Replaced by an OIDC callback in production. |

### Resident

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/resident/status` | Current allocation (cycle covering today), the open cycle and whether the resident is registered, and the resident's history in drawn cycles. Cached, see below. |
| POST | `/api/resident/register` | Registers for the building's open cycle. `201`. `409 no_open_cycle` or `409 already_registered`. `403 resident_inactive` after move-out. |

Withdrawing a registration is intentionally not implemented. It is the documented starter task for onboarding ([06-team-and-communication.md](06-team-and-communication.md)).

### Admin

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/admin/cycles` | Cycles for the building with registration counts, newest first. |
| POST | `/api/admin/cycles` | Body `{ startsOn, endsOn }` as `YYYY-MM-DD`. Sequence is assigned server-side. `201`. `409 open_cycle_exists` if a cycle is already open (enforced by a partial unique index). |
| GET | `/api/admin/cycles/:id` | Cycle, every registration with rank and spot when drawn, and the verification record (seed, executed at). |
| POST | `/api/admin/cycles/:id/draw` | Runs the draw in one transaction ([ADR-0004](adr/0004-draw-idempotency-via-cycle-state.md)). `201` with counts. `409 cycle_already_drawn` on a repeat. |
| GET | `/api/admin/spots` | Spots for the building. |
| POST | `/api/admin/spots` | Body `{ label }`. `409 spot_label_exists` on duplicate. |
| PATCH | `/api/admin/spots/:id` | Body `{ isActive }`. Inactive spots are excluded from future draws; existing allocations are untouched. |

## The draw request, step by step

1. Load the cycle scoped to the administrator's building. Missing means `404`.
2. Begin a transaction. `UPDATE raffle_cycles SET status = 'drawn' WHERE id = $1 AND status = 'open' RETURNING id`. Zero rows means another caller won the race; respond `409`.
3. In one query, load every registration for the cycle joined to the resident's history in this building: cycles since last allocation, lifetime allocations, and unsuccessful registrations. Residents who have moved out are excluded.
4. Load active spots. Generate a 16-byte random seed.
5. Call the pure `executeDraw` from `packages/domain`.
6. Insert allocations, then the `raffle_draws` verification row with the seed and the exact input.
7. Commit. Only then bump the building's cache version. No network call to Redis happens while a database connection is held.

## Caching

`GET /api/resident/status` is served cache-aside ([ADR-0005](adr/0005-redis-cache-aside-with-version-key.md)):

- Version key: `building:{buildingId}:version`, an integer.
- Value key: `building:{buildingId}:v{version}:resident:{residentId}:status`, TTL 300 seconds.
- Writes that bump the version after their transaction commits: registration, cycle creation, draw, spot creation, spot activation change.
- If Redis is unreachable the first failure is logged once and every read falls through to PostgreSQL. Nothing depends on the cache for correctness.
