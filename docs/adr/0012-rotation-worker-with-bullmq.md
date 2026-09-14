# ADR-0012: Quarterly rotation runs as a BullMQ repeatable job in a worker process

Status: Accepted, 2026-09-13. Supersedes [ADR-0007](0007-scheduling-deferred-behind-admin-endpoint.md).

## Context

The brief lists "rotate assignments every 3 months" as a core feature. ADR-0007 deferred the scheduler behind the administrator's draw endpoint until a deployment target made the choice concrete. That left the one numbered core feature that depends on time without automation, and the documented options (Redis queue, platform cron, `pg_cron`) unresolved.

Redis is already part of the system for the cache and is the intended buffer for camera events (ADR-0009). Nothing else runs on a timer.

## Decision

A separate worker process, `apps/api/src/scheduler/index.ts` (bundled to `dist/scheduler.js`), owns time. It registers one BullMQ repeatable job on Redis (`ROTATION_CRON`, default `0 6 * * *` UTC) and, when it fires, applies the rotation policy to every building.

The policy is a pure function in `packages/domain/src/rotation.ts`:

- If a cycle is open and today is within `DRAW_LEAD_DAYS` (default 7) of its start, draw it and open the following calendar quarter in the same run, so registration never has a gap and residents know their spot a week ahead.
- If nothing is open, open the quarter after the latest drawn cycle, skipping quarters that have already ended so the system catches up after downtime instead of replaying history.
- If a building has no cycles, do nothing. The first cycle is an administrator's decision.

Execution reuses the administrator's code paths, `runDraw` and `createCycle`, so a scheduled draw is indistinguishable from a manual one: same transaction, same verification record, same cache bump after commit.

`--once` runs the same policy immediately and exits. Platforms that prefer their own cron (EventBridge Scheduler, Kubernetes CronJob) call that instead of running the worker.

## Consequences

- Rotation is automatic. The administrator's "Run draw" button remains for exceptions and for the first cycle.
- Two processes in production instead of one: API and worker. Both are the same image; the worker is a one-task service. The API never schedules anything, so scaling API instances cannot double-fire a draw.
- Running the policy twice on the same day is a no-op by construction; the draw's state-transition mutex (ADR-0004) guards the case where two workers ever overlap.
- The draw and the following `createCycle` are separate transactions. If the second fails, the next run sees a drawn cycle with nothing open and opens it. No manual repair.
- Redis remains optional for correctness of reads and writes, but the worker depends on it for its schedule. If Redis is down the draw is late, not wrong; `--once` from any host recovers it.
- Dates are UTC, matching the rest of the system. A building in a different time zone sees the draw a few hours early or late on the boundary day, a known limitation shared with cycle periods.

## Alternatives considered

- `pg_boss` or `pg_cron`: no new dependency, but treating PostgreSQL as a queue adds vacuum churn, and `pg_cron` is an extension not every managed offering exposes. Redis was already present.
- In-process timer inside the API: fires once per instance; wrong as soon as there are two.
- Platform cron only: viable and supported through `--once`, but it moves the schedule outside the repository and the worker gives a single place to observe runs and retries.
- Keep deferring (ADR-0007): the deployment target is still unknown, but the choice no longer depends on it; the worker runs anywhere the API runs.

## Amendment, 2026-09-14: recovery after downtime

Independent review showed the original policy was not idempotent after long downtime: an open cycle whose quarter had ended was drawn and the *immediately* following quarter opened, so each same-day run advanced one historical quarter. The policy now opens the first quarter whose draw day is still in the future (`nextOpenablePeriod`), skipping quarters that have already started or ended. Consequences: a newly opened cycle always has a registration window; a second run on the same day is a no-op in every state, which the domain and integration tests now cover; a quarter already in progress when the worker recovers is not opened automatically, and an administrator can open and draw one by hand if the building wants it. An overdue open cycle is still drawn (its entrants get their outcome and history), and the worker logs a warning for that late draw.

## Amendment, 2026-09-14: failure policy per building

A review noted that `rotateAllBuildings` caught each building's error and the run still reported success. The policy is now explicit: one building's failure is logged with its id and never stops the other buildings; after all of them ran, the run as a whole fails (`--once` exits 1, the BullMQ job is marked failed) so platform alerting sees it. The next scheduled run retries the failed building without operator action, because the policy is idempotent and the draw mutex (ADR-0004) makes a repeated attempt safe. Covered by `apps/api/src/scheduler/rotation.test.ts`.

