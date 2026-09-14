# Residential Parking System

Parking spot allocation for a residential building. Residents register for a quarterly draw, spots rotate every three months, and allocation history drives a fairness rule that anyone can verify. The system is designed so that license plate cameras can attach later without touching the allocation domain.

This repository is a prototype built to demonstrate architecture, planning, and team leadership rather than a finished product. The brief's emphasis is on senior-level thinking, so the documentation carries as much weight as the code.

## Stack at a glance

| Layer | Choice |
| --- | --- |
| Language and tooling | TypeScript (strict), pnpm workspace, Turborepo, Biome, Vitest |
| Domain | Pure allocation engine, no I/O, unit-tested in isolation |
| API | Hono on Node.js LTS, Zod validation, typed client shared with the web app |
| Data | PostgreSQL 16 with Drizzle ORM; invariants as constraints, migrations in the repo |
| Cache and jobs | Redis 7: cache-aside keyed by a per-building version; BullMQ repeatable job runs the quarterly rotation |
| Web | React 19 with Vite, TanStack Query, shadcn/ui on Radix primitives, Tailwind CSS |
| Auth | JWT session in an HttpOnly cookie, role middleware, mock login in development |
| Observability | `pino` JSON logs with request ids, Prometheus metrics at `/api/metrics`, liveness and readiness endpoints |
| Infrastructure | Docker Compose locally, container images for API, worker, and web, GitHub Actions CI against real PostgreSQL and Redis |

Why each was chosen, and what was rejected: [docs/05-tools-and-strategies.md](docs/05-tools-and-strategies.md) and the [decision records](docs/adr/README.md).

## Where to start

| If you want to | Read |
| --- | --- |
| Understand what is built and what is only documented | [docs/00-prototype-scope.md](docs/00-prototype-scope.md) |
| Check every requirement of the brief against the repository | [docs/07-brief-coverage.md](docs/07-brief-coverage.md) |
| See the system shape and how it scales | [docs/01-architecture.md](docs/01-architecture.md) |
| Understand the fairness rule and data model | [docs/02-domain-and-fairness.md](docs/02-domain-and-fairness.md), [ADR-0003](docs/adr/0003-fairness-ranking-rule.md) |
| Call or extend the API | [docs/03-api.md](docs/03-api.md) |
| Know why each technology was chosen | [docs/adr](docs/adr/README.md) |
| See the plan, ownership, and delegation | [docs/04-delegation-plan.md](docs/04-delegation-plan.md) |
| See performance and security strategy | [docs/05-tools-and-strategies.md](docs/05-tools-and-strategies.md) |
| See how the team works and onboards | [docs/06-team-and-communication.md](docs/06-team-and-communication.md) |

## Run it locally

Requirements: Node.js 24 (pinned in `.node-version` for nvm and fnm; 22 or newer works), pnpm 10, Docker.

```sh
docker compose up -d --wait       # PostgreSQL 16 and Redis 7, waits for health checks
pnpm install --frozen-lockfile
pnpm db:migrate                   # apply the schema
pnpm db:seed                      # one building, 12 residents, two drawn quarters, one open
pnpm test                         # unit, component, and PostgreSQL-backed tests (uses its own parking_test database)
pnpm dev                          # API on http://localhost:3000, web on http://localhost:5173
pnpm scheduler --once             # optional: today's rotation check (draw due cycles, open the next quarter)
```

`pnpm scheduler` without `--once` runs the long-lived worker that does the same check daily at 06:00 UTC ([ADR-0012](docs/adr/0012-rotation-worker-with-bullmq.md)). A building whose rotation fails is logged and skipped, the others still run, and the run then exits 1 (or fails the job) so it is noticed; the next run retries it.

No `.env` file is needed for local development: the API falls back to the Docker Compose connection strings and a development-only JWT secret. To override anything, `cp .env.example .env` and edit; the file documents every variable and its default. In production `DATABASE_URL`, `REDIS_URL`, and `JWT_SECRET` are required and the API refuses to start without them; the rest keep their defaults.

To start over from an empty database: `docker compose down -v`, then repeat from `docker compose up -d --wait`.

Integration tests never touch the development data: the API test setup creates and migrates a separate `parking_test` database on the same server (override with `TEST_DATABASE_URL`).

### Seeded accounts

Development login is password-less (see [ADR-0008](docs/adr/0008-mock-auth-jwt-cookie-rbac.md) for the production path). Open http://localhost:5173 and pick an account, or type its email.

| Account | Role | What you will see |
| --- | --- | --- |
| `admin@parking.local` | Building administrator | Three cycles (two drawn, one open with 6 entrants), four spots, "Run draw" on the open cycle |
| `unit104@parking.local` | Resident, holds spot P3 | Lost cycle 1, won cycle 2, not registered for cycle 3: the "Register" button is live |
| `unit203@parking.local` | Resident, never allocated | Lost cycle 1, skipped cycle 2, registered for cycle 3: ranks first when the draw runs |
| `unit101@parking.local` | Resident, holds spot P1 | Lost cycle 1, won cycle 2, registered for cycle 3: will rank last because they hold a spot now |
| `unit303@parking.local` | Resident, no spot | Entered cycle 2 for the first time and lost, not registered for cycle 3 |
| `unit<NNN>@parking.local` | Any of units 101–104, 201–204, 301–304 | |

The fixture is deterministic: seeds and ids are pinned, so every machine gets the same history. With the fixture's entrants and spots unchanged, running the draw on cycle 3 as the administrator always allocates units 203, 102, 103, and 202 (only the order among the last three depends on the random seed) and leaves 101 and 302 without a spot, because they hold one this quarter; registering another resident first changes the outcome by the rule, not by chance.

Quality gates, also run in CI. `pnpm install` also installs Git hooks (lefthook) that run Biome on staged files, check the commit message format, and run typecheck plus the database-free tests before push:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Container images

Production-shaped images, built from the repository root with the workspace pruned to each app:

```sh
docker compose -f docker-compose.yml -f docker-compose.images.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.images.yml run --rm api node dist/migrate.js
open http://localhost:8080
```

- `apps/api/Dockerfile`: multi-stage; `turbo prune` → install → `tsup` single-file bundles for the server, the rotation worker, and the migrator. Runtime is `node:24-alpine`, non-root, with `dist/` and the migration SQL only. Migrations run as a one-off task, never at startup. The `scheduler` service runs the same image with `node dist/scheduler.js`.
- `apps/web/Dockerfile`: static build served by `nginxinc/nginx-unprivileged:1.27-alpine` (uid 101, port 8080), proxying `/api/` to `API_UPSTREAM` so the session cookie stays first-party; security headers and CSP set at the edge; `/api/metrics` blocked there.
- `docker-compose.images.yml`: local rehearsal of the reference topology in [docs/01-architecture.md](docs/01-architecture.md). Placeholder secrets, no TLS.

## Repository layout

```
apps/
  api/        Hono HTTP API. Owns auth, routes, cache, and the draw transaction.
  web/        React single-page app for residents and administrators.
packages/
  domain/     Pure allocation logic and shared types. No I/O.
  db/         Drizzle schema, migrations, and database client.
docs/
  adr/        Architecture decision records.
```

Boundaries: `domain` imports nothing from the workspace, `db` imports nothing from `api`, and `web` imports only the API's route types. pnpm's strict resolution blocks undeclared packages; `pnpm check:boundaries` (CI and pre-push) blocks relative imports that leave a package and runtime imports where only types are allowed, scanning static, dynamic (`import()`), and `require()` specifiers. Its scanner is unit-tested (`pnpm test:scripts`).

## Status

Prototype complete for the assessment scope. Decisions are recorded in `docs/adr`; `docs/00-prototype-scope.md` lists what is built versus documented, and `docs/07-brief-coverage.md` checks every requirement of the brief. Open work is tracked in GitHub issues.

## License

Apache License 2.0. See [LICENSE](LICENSE).
