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

Requirements: Node.js 22 or newer, pnpm 10, Docker.

```sh
docker compose up -d          # PostgreSQL and Redis
cp .env.example .env
pnpm install
pnpm db:migrate               # apply schema
pnpm db:seed                  # one building, 12 residents, two drawn quarters, one open
pnpm dev                      # API on :3000, web on :5173
```

Open http://localhost:5173 and sign in as `admin@parking.local` or any resident such as `unit101@parking.local`. Development login is password-less; see [ADR-0008](docs/adr/0008-mock-auth-jwt-cookie-rbac.md) for the production path.

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
