# Architecture

> Skeleton. Sections below are the outline for deliverable 1 of the brief. Each will be filled with a diagram and a short explanation once the prototype's shape is confirmed in code.

## System overview

- Component diagram: web app, API, PostgreSQL, Redis, and the future camera event path. Mermaid, rendered by GitHub.
- One paragraph on the request flow for the most common action: a resident opening their status page.
- One paragraph on the draw: administrator triggers, API runs the pure domain function inside a transaction, cache version bumps.

## Components and boundaries

- `apps/web`, `apps/api`, `packages/domain`, `packages/db`, and what each is allowed to import. Link to [ADR-0001](adr/0001-modular-monolith-in-pnpm-workspace.md).
- Where the license plate subsystem attaches. Link to [ADR-0009](adr/0009-lpr-as-async-event-subsystem.md).

## Data flow and consistency

- Source of truth is PostgreSQL. Redis is a read accelerator and a future queue, never required for correctness. Link to [ADR-0004](adr/0004-draw-idempotency-via-cycle-state.md) and [ADR-0005](adr/0005-redis-cache-aside-with-version-key.md).

## Scaling path

- One building: single API instance, managed PostgreSQL, managed Redis.
- Many buildings, one operator: `building_id` on every tenant table today; add Row-Level Security policies and a connection pooler when instance count grows. Stateless API scales horizontally behind a load balancer.
- Many operators: schema-per-tenant or database-per-tenant as a documented option, with the trade-offs.
- What does not need to scale: draw volume. Four draws a year per building is not a throughput problem at any realistic building count.

## Deployment reference

- Container image per app. Static web files behind a CDN. API behind a load balancer with health checks. Managed PostgreSQL with automated backups and point-in-time recovery. Managed Redis.
- Secrets in the platform's secret store, never in images or the repository.
- Environments: local (Docker Compose), staging, production. Migrations run as a release step, not at API startup.
