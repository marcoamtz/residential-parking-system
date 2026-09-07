# Architecture

The system is a modular monolith: one API process, one PostgreSQL database, one Redis instance, and a static web client. Boundaries are enforced at the package level so that the parts most likely to change (the camera subsystem, the identity provider, the scheduler) attach at seams that already exist. Decisions with lasting consequences are recorded in [docs/adr](adr/README.md); this document shows how they fit together.

## System overview

```mermaid
flowchart LR
  subgraph client [Browser]
    web["apps/web<br/>React SPA"]
  end

  subgraph api ["apps/api (Hono on Node.js LTS)"]
    routes["Routes<br/>auth · resident · admin"]
    domain["packages/domain<br/>executeDraw (pure)"]
    db["packages/db<br/>Drizzle schema + client"]
    cache["cache.ts<br/>version-keyed cache-aside"]
    routes --> domain
    routes --> db
    routes --> cache
  end

  pg[("PostgreSQL 16<br/>source of truth")]
  redis[("Redis 7<br/>read cache · future queue")]

  web -- "HTTPS JSON<br/>cookie session" --> routes
  db --> pg
  cache --> redis

  subgraph future ["Future: license plate recognition (ADR-0009)"]
    cam["Edge worker<br/>camera + inference"]
    hook["Ingestion webhook<br/>HMAC-signed"]
    worker["Occupancy worker"]
    cam -. "plate_detected event" .-> hook
    hook -. enqueue .-> redis
    redis -. drain .-> worker
    worker -. "vehicle_events" .-> pg
  end
```

Solid lines exist in the prototype. Dashed lines are the documented extension path; nothing in the current code depends on them.

### The most common request: a resident opens their status page

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as API
  participant R as Redis
  participant P as PostgreSQL

  B->>A: GET /api/resident/status (cookie)
  A->>A: verify JWT, role = resident, residentId from claims
  A->>R: GET building:{b}:version
  R-->>A: 2
  A->>R: GET building:{b}:v2:resident:{r}:status
  alt hit
    R-->>A: cached JSON
  else miss
    R-->>A: nil
    A->>P: resident, current allocation, open cycle, history (4 queries)
    P-->>A: rows
    A->>R: SET key EX 300
  end
  A-->>B: 200 status JSON
```

### The rare request: an administrator runs the draw

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as API
  participant P as PostgreSQL
  participant R as Redis

  B->>A: POST /api/admin/cycles/{id}/draw
  A->>P: SELECT cycle WHERE id AND building_id
  A->>P: BEGIN
  A->>P: UPDATE raffle_cycles SET status='drawn' WHERE id AND status='open' RETURNING id
  alt 0 rows
    A->>P: ROLLBACK
    A-->>B: 409 cycle_already_drawn
  else 1 row
    A->>P: entrants + history (one CTE query), active spots
    A->>A: executeDraw(input, seed)
    A->>P: INSERT spot_allocations, INSERT raffle_draws
    A->>P: COMMIT
    A->>R: INCR building:{b}:version
    A-->>B: 201 counts
  end
```

The cache call happens after `COMMIT`. No network round trip to Redis occurs while a database connection is held ([ADR-0004](adr/0004-draw-idempotency-via-cycle-state.md), [ADR-0005](adr/0005-redis-cache-aside-with-version-key.md)).

## Components and boundaries

| Package | Responsibility | May import | Must not import |
| --- | --- | --- | --- |
| `packages/domain` | The ranking rule and the draw as a pure function. Shared domain types. | Nothing from the workspace. No Node or browser APIs. | `db`, `api`, `web` |
| `packages/db` | Drizzle schema, constraints, migrations, client factory, migrator script. | `drizzle-orm`, `pg` | `domain`, `api`, `web` |
| `apps/api` | HTTP routes, session, authorization, cache, the draw transaction, seed fixture. | `domain`, `db` | `web` |
| `apps/web` | React client. | The API's exported route type only (`import type { AppType }`). | Anything at runtime from `api`, `db`, or `domain` |

These rules are enforced by `package.json` dependencies under pnpm's strict resolution: a package cannot import what it does not declare. The web app declares `@parking/api` for its types and gets compile-time checking of every request and response ([ADR-0006](adr/0006-hono-api-with-shared-types.md)).

Where the camera subsystem attaches: a new route module under `apps/api` for the webhook, a new table for vehicle events, and a worker process that shares `packages/db`. The allocation domain does not change ([ADR-0009](adr/0009-lpr-as-async-event-subsystem.md)).

## Data flow and consistency

- PostgreSQL is the only source of truth. Invariants are constraints: a spot allocated once per cycle, a registration wins at most once, a winner must be an entrant of that same cycle (composite foreign key), one open cycle per building (partial unique index). See [02-domain-and-fairness.md](02-domain-and-fairness.md).
- The draw's idempotency is a state transition inside the same transaction as the writes. Retries are safe by construction.
- Redis accelerates one read path and is never consulted for a decision. If it is down, the API logs once and serves from PostgreSQL. If it is wiped, nothing is lost.
- Every write that changes what residents see bumps the building version after commit, so a resident refreshing right after a draw sees the result. Between the commit and the bump there is a window of milliseconds where a read may cache stale data under the old version; the next bump makes that key unreachable, and the 300 second TTL bounds it in any case.

## Scaling path

Draw volume never needs to scale: four draws per building per year is not a throughput problem at any realistic number of buildings. What scales is read traffic right after a draw is announced, and the number of tenants sharing one deployment.

| Stage | What changes | What does not |
| --- | --- | --- |
| One building (today) | Single API instance, one PostgreSQL, one Redis. Docker Compose locally. | |
| Many buildings, one operator | `building_id` is already on every tenant table and every query is already scoped by it. Add Row-Level Security policies keyed on a session variable so a missed `WHERE` in application code cannot leak across buildings. Run two or more API instances behind a load balancer; the API is stateless (session in cookie). Add a connection pooler (PgBouncer, transaction mode) once instance count times pool size approaches PostgreSQL's connection limit. | Schema, domain code, cache scheme (already keyed per building). |
| Many operators | Choose between shared schema with RLS (cheapest), schema per tenant (stronger isolation, same instance), or database per tenant (regulatory isolation). The code path is identical; the connection string becomes tenant-resolved. | Domain, API, web. |
| Camera telemetry | Bursts land on the Redis queue, a separate worker drains them. Add read replicas only if the occupancy dashboard becomes read-heavy; the allocation path never needs them. | The draw and the resident status path. |

Row-Level Security is the single most valuable hardening step and is deferred, not skipped: at one building it adds policy management without protecting anything the `building_id` scoping does not already protect.

## Deployment

### Local prototype versus reference cloud topology

The prototype runs on Docker Compose. The reference topology below is the intended production shape on AWS; the equivalents on GCP or Azure are one-to-one (Cloud Run or Container Apps, Cloud SQL or Azure Database, Memorystore or Azure Cache). Nothing in the code is provider-specific.

| Concern | Local prototype | Reference production |
| --- | --- | --- |
| API runtime | `tsx watch` in a terminal | Container image (`tsup` bundle on `node:24-alpine`) on ECS Fargate, 2+ tasks across availability zones |
| Web | Vite dev server with `/api` proxy | Static build in S3 behind CloudFront; `/api/*` routed to the ALB |
| Entry point | `localhost:5173` | Application Load Balancer, TLS termination, health check on `/api/health` |
| Database | `postgres:16-alpine` container | RDS for PostgreSQL 16, Multi-AZ, automated backups, point-in-time recovery, encryption at rest |
| Cache and queue | `redis:7-alpine` container | ElastiCache for Redis, single node is enough; loss is tolerated by design |
| Secrets | `.env` file (git-ignored) | Secrets Manager injected as task environment; `JWT_SECRET` rotated by redeploy |
| Migrations | `pnpm db:migrate` by hand | One-off ECS task running the same migrator before the new API task set is promoted; a failed migration fails the deploy, not the service |
| Identity | Password-less mock login | OIDC provider (Cognito, Auth0, or Keycloak) issuing the same session cookie ([ADR-0008](adr/0008-mock-auth-jwt-cookie-rbac.md)) |
| Scheduler | Administrator clicks "Run draw" | Deferred decision; three options in [ADR-0007](adr/0007-scheduling-deferred-behind-admin-endpoint.md) |
| Infrastructure as code | Docker Compose file | Terraform, one module per environment, state in S3 with locking |

### Environments

Local, staging, production. Staging mirrors production topology at the smallest instance sizes and is where camera fixtures are replayed before any hardware is installed. Promotion is by image tag; the same image runs in staging and production.

### Why not serverless

The API holds a PostgreSQL connection pool and, later, a long-lived queue consumer. Both fit a small always-on container better than a function per request, and the traffic profile (a few hundred residents, quarterly peaks) does not need scale-to-zero economics. Hono runs unchanged on Lambda if that assessment changes.
