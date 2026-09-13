# Tools and strategies

Stack rationale in full lives in the ADRs. This document summarizes the choices, records the trade-offs that were weighed, and covers performance, security, and reliability strategy.

## Stack summary

| Layer | Choice | One-line reason | Decision record |
| --- | --- | --- | --- |
| Repository | pnpm workspace + Turborepo | Compile-time boundaries between packages; cached `typecheck`/`test`/`build` | [ADR-0001](adr/0001-modular-monolith-in-pnpm-workspace.md) |
| Database | PostgreSQL 16 | Relational invariants as constraints; partial unique indexes; JSONB for telemetry | [ADR-0002](adr/0002-postgresql-with-drizzle.md) |
| Data access | Drizzle ORM | TypeScript schema, SQL-shaped queries, generated migrations, no query engine binary | [ADR-0002](adr/0002-postgresql-with-drizzle.md) |
| API | Hono on Node.js LTS | Web-standard request/response, small, typed client for the first-party web app | [ADR-0006](adr/0006-hono-api-with-shared-types.md) |
| Validation | Zod | One schema validates the request and types the handler and the client | [ADR-0006](adr/0006-hono-api-with-shared-types.md) |
| Cache | Redis 7 | Version-keyed cache-aside; future queue for camera events | [ADR-0005](adr/0005-redis-cache-aside-with-version-key.md) |
| Jobs | BullMQ on Redis | One repeatable job runs the quarterly rotation from a worker process; `--once` for platform cron | [ADR-0012](adr/0012-rotation-worker-with-bullmq.md) |
| Web | React 19 + Vite, TanStack Query, shadcn/ui + Tailwind CSS | Authenticated portal, no SEO, server state handled declaratively; owned components on Radix primitives | [ADR-0010](adr/0010-react-vite-spa.md), [ADR-0011](adr/0011-shadcn-ui-from-the-start.md) |
| Sessions | JWT in HttpOnly cookie | Stateless API; browser cannot read the token | [ADR-0008](adr/0008-mock-auth-jwt-cookie-rbac.md) |

### Development tooling

| Tool | Problem it solves |
| --- | --- |
| TypeScript strict mode with `noUncheckedIndexedAccess` | Array access and optional data are checked at compile time; the codebase has no non-null assertions. |
| Biome | One tool for lint and format, fast enough to run on every save and in CI. |
| Vitest | Same runner for pure domain tests, PostgreSQL-backed integration tests, and React component tests (Testing Library on jsdom). |
| Docker Compose | PostgreSQL and Redis locally with health checks; the same images CI uses as services. |
| lefthook | Git hooks installed by `pnpm install`: Biome on staged files at commit, Conventional Commits check on the message, typecheck and the database-free tests before push. CI enforces the same gates; the hooks exist to fail fast. |
| `tsx` | Runs TypeScript directly in development and for scripts (migrate, seed). |
| `tsup` | Bundles the API and its workspace packages into one artifact for the container image. |
| GitHub Actions | Lint, typecheck, migrate, test against real services, build, with Turborepo cache restored between runs. |

## Trade-offs that were weighed

**Hono typed client versus REST with OpenAPI versus tRPC.** The web app needed compile-time checking of request and response shapes; external systems (cameras, an identity provider) need ordinary HTTP. tRPC gives the first and takes away the second. REST with OpenAPI code generation gives both at the cost of a generation step that drifts when someone forgets to run it. Hono's typed client gives both with no generation: the endpoints are ordinary HTTP with JSON bodies, and the web app imports the route type. The cost is a smaller ecosystem than Express or NestJS, acceptable for a four-resource API.

**Node.js LTS versus Bun.** Bun is faster to start and runs TypeScript natively. Production runs Node.js because the observability, security scanning, and container tooling are mature there, and because a long-lived process with a database pool and a queue consumer benefits from the most battle-tested event loop available. Hono is built on web standards, so the same code runs on Bun locally if a developer prefers it; the runtime is not a lock-in.

**Version-keyed cache invalidation versus key scans versus TTL only.** TTL only means residents see stale status for the TTL right after a draw, which is exactly when they look. Deleting specific keys on write means knowing every affected key or scanning Redis, which is fragile as cached views multiply. A per-building version in the key makes every existing key unreachable with one `INCR`, no scan, and old keys expire on their own. The cost is one extra `GET` per read and coarse invalidation (one registration invalidates all residents' cached status in that building), both acceptable because reads are cheap to rebuild and writes are rare.

**Drizzle versus Prisma.** Prisma has the better onboarding experience and a mature ecosystem. It also ships a query engine, abstracts the SQL that matters for index and constraint work, and its migration workflow fights composite constraints. Drizzle is a thin layer over SQL: the schema file reads like DDL, `sql` fragments are first-class, and the composite foreign key and partial unique index in this schema are declared inline. The migrator is invoked from a script rather than `drizzle-kit migrate` because the CLI exits without printing the database error on failure, which was discovered while building this.

**BullMQ worker versus PostgreSQL-based jobs versus platform cron.** `pg_boss` avoids a second store but turns PostgreSQL into a queue, with the vacuum churn that brings; `pg_cron` is an extension not every managed database exposes. A platform cron keeps the schedule outside the repository. Redis was already deployed for the cache, so a BullMQ repeatable job costs no new infrastructure, keeps the schedule in code, and gives one place to see runs and retries. `--once` keeps the platform-cron option open for operators who prefer it ([ADR-0012](adr/0012-rotation-worker-with-bullmq.md)).

**Deterministic ranking versus weighted lottery.** Covered in [ADR-0003](adr/0003-fairness-ranking-rule.md). Short version: a lottery with tuned weights cannot be explained in a sentence and every constant invites "why that number"; a sorted list can be explained to a resident and replayed by anyone.

**State transition as mutex versus serializable transactions.** Covered in [ADR-0004](adr/0004-draw-idempotency-via-cycle-state.md). `UPDATE ... WHERE status = 'open'` under default isolation lets exactly one caller through with no retry loop; unique constraints remain the hard invariant underneath.

## Performance

**The draw.** Sorting a few hundred entrants is microseconds. The cost is the transaction, and it is kept short: one `UPDATE` to claim, one query for entrants with history (a CTE with `FILTER` aggregates, no per-entrant round trips), one for active spots, computation in memory, two multi-row `INSERT`s, commit. The cache call happens after commit so no Redis round trip is made while a connection is held.

**Reads.** `GET /api/resident/status` is the hot path after a draw is announced. It is cached per resident under the building version with a 300 second TTL. Expected hit rate after a draw: high, because each resident refreshes several times and the data only changes when someone registers for the next cycle. Measurement: a `cache_hit`/`cache_miss` counter per route is the first metric to add; it is not in the prototype.

**Database.** Every index maps to a query in [02-domain-and-fairness.md](02-domain-and-fairness.md). At residential-building volumes all tables fit in memory and the planner will use indexes for joins and sequential scans for aggregates, both correctly. Connection pooling: `pg.Pool` per API instance today; PgBouncer in transaction mode when instances multiply. Read replicas are not needed on any allocation path and are stated as such rather than listed as a plan.

**Load balancing.** The API is stateless. Sessions are in the cookie, the cache is shared, and the database is the only coordination point. Any instance serves any request; the load balancer needs only `/api/health`.

**What does not need to scale.** Four draws per building per year. Even ten thousand buildings is a hundred draws a day. Design effort went into the read path and tenant isolation, not the draw.

## Security

**Data protection.**
- TLS at the load balancer; the API never listens on a public address.
- Resident personal data in the prototype is name, unit, and email. When plates arrive they are encrypted at the column level (`pgcrypto`) so a database dump alone does not expose them.
- Backups encrypted at rest (RDS default). Point-in-time recovery enabled.
- No personal data in application logs. The request logger records method, path, status, and duration only. Enforced in code review via the pull request checklist.

**Authentication and authorization** ([ADR-0008](adr/0008-mock-auth-jwt-cookie-rbac.md)).
- Session is an HS256 JWT with a 12 hour expiry in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie. Scripts cannot read it; cross-site requests do not carry it.
- Role middleware runs before any handler. Resident routes derive the resident from claims; no route accepts a resident id from the client. Admin routes scope every query by the administrator's building.
- The development login is behind `MOCK_AUTH` and returns `404` in production. Swapping to OIDC replaces one route.

**Common vulnerabilities, mapped to code.**
| Threat | Control | Where |
| --- | --- | --- |
| SQL injection | Parameterized queries only; the one raw SQL query uses tagged-template parameters | `loadEntrants` in `apps/api/src/admin/draw.ts` |
| XSS | React escapes text by default; no `dangerouslySetInnerHTML`; no HTML rendered from user input | `apps/web` |
| CSRF | `SameSite=Strict` cookie plus a required `X-Requested-With` header on every mutating request | `apps/api/src/csrf.ts` |
| Broken object-level authorization | Resident id from session claims; admin queries filtered by `building_id`; cross-tenant access returns 404 | `residentIdOf`, admin routes, integration test "does not let a building draw another building's cycle" |
| Mass assignment | Zod schemas whitelist exactly the accepted fields | every `zValidator` call |
| Race conditions | State-transition mutex and unique constraints | `runDraw`, schema |
| Session theft | HttpOnly cookie; short expiry; secret from the environment, rotated by redeploy | `apps/api/src/auth/session.ts` |

**Cloud practices for the reference topology.**
- Least-privilege task roles; the API role can reach RDS and ElastiCache and nothing else.
- Database and cache in private subnets; security groups allow only the API tasks.
- Secrets in Secrets Manager, injected at task start, never in images or the repository. `.env` is git-ignored and `.env.example` carries no real values.
- Container images scanned on push. A `pnpm audit` gate with a failure threshold on high severity is the next CI addition; it is not in the prototype pipeline.
- Infrastructure as code so the security posture is reviewable in a pull request.

## Reliability and observability

- **Health and readiness.** `/api/health` is liveness and never touches a dependency; container health checks use it. `/api/ready` runs `select 1` against PostgreSQL and returns `503` if it fails; Redis is reported but never fatal. Load balancers route on readiness.
- **Logs.** `pino` JSON to stdout, shipped by the platform. One line per request with the request id (`X-Request-Id`, honored from nginx or the load balancer, generated otherwise), method, matched route, status, and duration. Bodies, query strings, and cookies are never logged, so resident data cannot leak through logs. Unhandled errors log the stack with the request id.
- **Metrics.** Prometheus text at `/api/metrics` via `prom-client`: `http_requests_total` and `http_request_duration_seconds` labelled by method and matched route pattern (bounded cardinality), `cache_requests_total{result=hit|miss}` for the cache-aside path, `draw_duration_seconds` around the draw transaction, plus Node.js process defaults. The endpoint is scraped inside the network and not exposed through the load balancer.
- **Next.** Error tracking with alerting on 5xx rate, and OpenTelemetry traces if the camera subsystem makes the request path multi-hop. Prometheus metrics were chosen first because they answer the two operational questions this system has (is the cache working, how long do draws take) with no collector to run.
- **Backups and drills.** Automated RDS snapshots plus point-in-time recovery. A restore drill into staging once per quarter, timed to the cycle boundary when a restore would matter most.
- **What is lost if Redis is lost.** Nothing. Cached reads rebuild from PostgreSQL; the API logs one warning and continues. When the camera queue exists, events in flight would be lost, so that queue will need Redis persistence or a durable broker. That choice is deferred to the license plate work ([ADR-0009](adr/0009-lpr-as-async-event-subsystem.md)).
- **Migrations.** Applied as a release step by a one-off task, never at API startup. A failing migration fails the deploy and leaves the running version untouched.
