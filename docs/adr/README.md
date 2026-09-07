# Architecture decision records

Each record captures one decision that would be expensive to reverse or that a new team member would otherwise have to rediscover. Records are short by design: context, decision, consequences, and the alternatives that were considered.

A record is never edited once accepted. If a decision changes, a new record supersedes it and the old one is marked as superseded. This keeps the reasoning trail intact for anyone auditing why the system looks the way it does.

| ID | Title | Status |
| --- | --- | --- |
| [0001](0001-modular-monolith-in-pnpm-workspace.md) | Modular monolith in a pnpm workspace | Accepted |
| [0002](0002-postgresql-with-drizzle.md) | PostgreSQL with Drizzle ORM | Accepted |
| [0003](0003-fairness-ranking-rule.md) | Fairness ranking rule for the quarterly draw | Accepted |
| [0004](0004-draw-idempotency-via-cycle-state.md) | Draw idempotency via cycle state transition | Accepted |
| [0005](0005-redis-cache-aside-with-version-key.md) | Redis cache-aside with a version key | Accepted |
| [0006](0006-hono-api-with-shared-types.md) | Hono API with shared request/response types | Accepted |
| [0007](0007-scheduling-deferred-behind-admin-endpoint.md) | Scheduling deferred behind an admin endpoint | Accepted |
| [0008](0008-mock-auth-jwt-cookie-rbac.md) | Mock authentication with JWT cookie and role checks | Accepted |
| [0009](0009-lpr-as-async-event-subsystem.md) | License plate recognition as an asynchronous event subsystem | Accepted |
| [0010](0010-react-vite-spa.md) | React single-page app built with Vite | Accepted |
