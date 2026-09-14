# Prototype scope

The brief is explicit: the emphasis is on senior-level thinking, not on delivering working code. The prototype therefore proves the parts of the system that carry risk, and documents the rest.

## What the prototype proves

| Area | Why it is in the prototype |
| --- | --- |
| Fair allocation engine | The core of the domain. A deterministic, replayable draw with a one-sentence fairness rule ([ADR-0003](adr/0003-fairness-ranking-rule.md)). |
| Draw idempotency | Double-allocation is the one bug residents would notice. Enforced by constraints and a status transition that relies on PostgreSQL's own row lock; no separate advisory or application lock ([ADR-0004](adr/0004-draw-idempotency-via-cycle-state.md)). |
| Relational model with history | Residents, spots, cycles, registrations, and allocations in PostgreSQL. History is the allocation table itself, not a separate log ([ADR-0002](adr/0002-postgresql-with-drizzle.md)). |
| Cache-aside for resident status | Required by the brief. Redis, version-keyed invalidation ([ADR-0005](adr/0005-redis-cache-aside-with-version-key.md)). |
| Typed API | Hono with end-to-end request/response types shared with the web app ([ADR-0006](adr/0006-hono-api-with-shared-types.md)). |
| Mock authentication and roles | Seeded users, JWT in an HttpOnly cookie, resident and admin roles ([ADR-0008](adr/0008-mock-auth-jwt-cookie-rbac.md)). |
| Minimal web UI | One resident page (status, next cycle, register) and one admin page (run draw, view results) ([ADR-0010](adr/0010-react-vite-spa.md)). |
| Quarterly rotation worker | A BullMQ repeatable job draws each open cycle a week before it starts and opens the next quarter in the same run; after downtime it draws the overdue cycle and opens the first quarter whose draw day is still ahead; `--once` mode for platform cron ([ADR-0012](adr/0012-rotation-worker-with-bullmq.md)). |
| Local infrastructure | Docker Compose for PostgreSQL and Redis. Container images for API, worker, and web. CI runs lint, typecheck, tests, and image builds. |

## What is documented but not built

| Area | Where it is covered |
| --- | --- |
| License plate recognition | Event contract, ingestion boundary, and delegation plan in [ADR-0009](adr/0009-lpr-as-async-event-subsystem.md) and [04-delegation-plan.md](04-delegation-plan.md). |
| Real identity provider | Swap path from mock auth to OIDC in [ADR-0008](adr/0008-mock-auth-jwt-cookie-rbac.md). |
| Multi-building isolation | `building_id` on the tenant roots from day one and every query scoped by the session's building; registrations, allocations, and draws inherit the building through their cycle. Same-building ownership of a registration or allocation is enforced by the scoped services, not by a constraint. Row-Level Security (direct and join-based policies) as the hardening step in [01-architecture.md](01-architecture.md). |
| Cloud deployment | Container images and a compose rehearsal are built; the reference AWS topology and deployment diagram are in [01-architecture.md](01-architecture.md). There is no live environment. |
| PgBouncer, load balancing, error tracking | [05-tools-and-strategies.md](05-tools-and-strategies.md). Application-side pooling (`pg.Pool`), logs, metrics, and readiness are built. |
| Withdrawing a registration | The onboarding starter task, issue #12 ([06-team-and-communication.md](06-team-and-communication.md)). |
| Households with more than one vehicle, mid-cycle reassignment, building time zones, quarter alignment | Known limits with sketched extensions in [02-domain-and-fairness.md](02-domain-and-fairness.md). |
| Dependency audit gate, digest-pinned base images, image scan threshold | Documented as next steps in [05-tools-and-strategies.md](05-tools-and-strategies.md); the scan runs but is informational. |
| Spot preferences and accessibility needs | Out of scope for the draw. Flagged as the first fairness extension in [02-domain-and-fairness.md](02-domain-and-fairness.md). |

## How this maps to the brief

| Deliverable in the brief | Where to look |
| --- | --- |
| 1. Architecture and design documentation | [01-architecture.md](01-architecture.md), [docs/adr](adr/README.md) |
| 2. Planning and delegation strategy | [04-delegation-plan.md](04-delegation-plan.md) |
| 3. Tools and strategies | [05-tools-and-strategies.md](05-tools-and-strategies.md) |
| 4. Documentation and communication | [06-team-and-communication.md](06-team-and-communication.md), this docs folder |
| 5. Core codebase prototype | `packages/domain`, `packages/db`, `apps/api`, `apps/web` |

A line-by-line check of every requirement in the brief, with the evidence for each, is in [07-brief-coverage.md](07-brief-coverage.md).
