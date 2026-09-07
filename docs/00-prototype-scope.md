# Prototype scope

The brief is explicit: the emphasis is on senior-level thinking, not on delivering working code. The prototype therefore proves the parts of the system that carry risk, and documents the rest.

## What the prototype proves

| Area | Why it is in the prototype |
| --- | --- |
| Fair allocation engine | The core of the domain. A deterministic, replayable draw with a one-sentence fairness rule ([ADR-0003](adr/0003-fairness-ranking-rule.md)). |
| Draw idempotency | Double-allocation is the one bug residents would notice. Enforced by constraints and a state transition, not by locks ([ADR-0004](adr/0004-draw-idempotency-via-cycle-state.md)). |
| Relational model with history | Residents, spots, cycles, registrations, and allocations in PostgreSQL. History is the allocation table itself, not a separate log ([ADR-0002](adr/0002-postgresql-with-drizzle.md)). |
| Cache-aside for resident status | Required by the brief. Redis, version-keyed invalidation ([ADR-0005](adr/0005-redis-cache-aside-with-version-key.md)). |
| Typed API | Hono with end-to-end request/response types shared with the web app ([ADR-0006](adr/0006-hono-api-with-shared-types.md)). |
| Mock authentication and roles | Seeded users, JWT in an HttpOnly cookie, resident and admin roles ([ADR-0008](adr/0008-mock-auth-jwt-cookie-rbac.md)). |
| Minimal web UI | One resident page (status, next cycle, register) and one admin page (run draw, view results) ([ADR-0010](adr/0010-react-vite-spa.md)). |
| Local infrastructure | Docker Compose for PostgreSQL and Redis. CI runs lint, typecheck, and tests. |

## What is documented but not built

| Area | Where it is covered |
| --- | --- |
| Scheduled quarterly draws | Admin-triggered endpoint now; scheduler options and the chosen seam in [ADR-0007](adr/0007-scheduling-deferred-behind-admin-endpoint.md). |
| License plate recognition | Event contract, ingestion boundary, and delegation plan in [ADR-0009](adr/0009-lpr-as-async-event-subsystem.md) and [04-delegation-plan.md](04-delegation-plan.md). |
| Real identity provider | Swap path from mock auth to OIDC in [ADR-0008](adr/0008-mock-auth-jwt-cookie-rbac.md). |
| Multi-building isolation | `building_id` on every tenant-owned table from day one; Row-Level Security as the hardening step in [01-architecture.md](01-architecture.md). |
| Cloud deployment | Container images and a reference topology in [01-architecture.md](01-architecture.md); no live environment. |
| Connection pooling, observability, load balancing | [05-tools-and-strategies.md](05-tools-and-strategies.md). |
| Spot preferences and accessibility needs | Out of scope for the draw. Flagged as the first fairness extension in [02-domain-and-fairness.md](02-domain-and-fairness.md). |

## How this maps to the brief

| Deliverable in the brief | Where to look |
| --- | --- |
| 1. Architecture and design documentation | [01-architecture.md](01-architecture.md), [docs/adr](adr/README.md) |
| 2. Planning and delegation strategy | [04-delegation-plan.md](04-delegation-plan.md) |
| 3. Tools and strategies | [05-tools-and-strategies.md](05-tools-and-strategies.md) |
| 4. Documentation and communication | [06-team-and-communication.md](06-team-and-communication.md), this docs folder |
| 5. Core codebase prototype | `packages/domain`, `packages/db`, `apps/api`, `apps/web` |
