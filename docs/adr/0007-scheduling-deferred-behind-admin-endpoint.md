# ADR-0007: Scheduling deferred behind an admin endpoint

Status: Superseded by [ADR-0012](0012-rotation-worker-with-bullmq.md) on 2026-09-13. Accepted 2026-09-06.

## Context

Draws happen once per quarter. Cycles must be created, opened for registration, drawn, and then become the active period. In production this should run on a schedule. In the prototype, a scheduler adds infrastructure and failure modes without proving anything about the domain.

## Decision

The prototype exposes administrative endpoints to create a cycle and to run its draw. Those endpoints are the seam. Whatever schedules draws in production calls the same code path the administrator does, so the draw logic is exercised identically whether triggered by a person or a timer.

The production scheduler is a deferred decision with three viable options, in order of preference given the current stack:

1. A repeatable job in a Redis-backed queue, since Redis is already deployed (ADR-0005).
2. A platform cron (Kubernetes CronJob or equivalent) calling the admin endpoint with a service credential.
3. `pg_cron` inside PostgreSQL, if the operator prefers fewer moving parts.

## Consequences

- The prototype has no background process. Local development is `docker compose up` plus two dev servers.
- Idempotency (ADR-0004) means a scheduler that fires twice is harmless.
- The decision can be made when there is an operating environment to make it in, which is the right time.

## Alternatives considered

- Build the scheduler now: real cost, no evaluative value, and the choice depends on the deployment target.
- In-process timer in the API: fails on the first horizontal scale-out when two instances both fire.
