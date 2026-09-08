# Residential Parking System

Parking spot allocation for a residential building. Residents register for a quarterly draw, spots rotate every three months, and allocation history drives a fairness rule that anyone can verify. The system is designed so that license plate cameras can attach later without touching the allocation domain.

This repository is a prototype built to demonstrate architecture, planning, and team leadership rather than a finished product. The brief's emphasis is on senior-level thinking, so the documentation carries as much weight as the code.

## Where to start

| If you want to | Read |
| --- | --- |
| Understand what is built and what is only documented | [docs/00-prototype-scope.md](docs/00-prototype-scope.md) |
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
pnpm test                         # domain unit tests and PostgreSQL-backed integration tests
pnpm dev                          # API on http://localhost:3000, web on http://localhost:5173
```

No `.env` file is needed for local development: the API falls back to the Docker Compose connection strings and a development-only JWT secret. To override anything, `cp .env.example .env` and edit. In production every variable in `.env.example` is required and the API refuses to start without them.

To start over from an empty database: `docker compose down -v`, then repeat from `docker compose up -d --wait`.

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

The fixture is deterministic: seeds and ids are pinned, so every machine gets the same history. Running the draw on cycle 3 as the administrator always allocates units 203, 102, 103, and 202 (only the order among the last three depends on the random seed) and leaves 101 and 302 without a spot, because they hold one this quarter.

Quality gates, also run in CI:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

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

Boundaries are enforced by package dependencies: `domain` imports nothing from the workspace, `db` imports nothing from `api`, and `web` imports only the API's route types.

## Status

Prototype in progress. Decisions are recorded in `docs/adr`; the scope table in `docs/00-prototype-scope.md` lists what is built versus documented.

## License

Apache License 2.0. See [LICENSE](LICENSE).
