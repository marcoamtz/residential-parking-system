# ADR-0001: Modular monolith in a pnpm workspace

Status: Accepted, 2026-09-06

## Context

The system has a small number of clear bounded contexts: the allocation domain, persistence, the HTTP API, and the web client. A future license plate recognition subsystem will attach at a well-defined boundary. Traffic is low (residents check status a few times per quarter), so the operational cost of separate services would not buy anything today, but the boundaries must be real enough that a service could be extracted if a building operator grows to many sites.

## Decision

One repository, one deployable API, with internal packages that enforce boundaries at compile time:

- `packages/domain`: pure allocation logic and shared types. No I/O, no framework imports.
- `packages/db`: Drizzle schema, migrations, and database client.
- `apps/api`: Hono HTTP server. Depends on `domain` and `db`.
- `apps/web`: React client. Depends on the API's exported route types only.

pnpm workspaces manage the packages. Turborepo runs `build`, `typecheck`, and `test` across them with caching so CI and local runs only redo what changed.

## Consequences

- The domain package can be unit tested with no database, which is where most of the test effort goes.
- A junior developer can own one package with a narrow, typed surface.
- Extraction path: `packages/domain` plus a thin transport becomes a service without rewriting business rules.
- Cost: one more layer of configuration than a single-package project. Accepted because the boundaries are the point of the exercise.

## Alternatives considered

- Single package with folders: no compile-time enforcement of boundaries; easy to leak database code into domain logic.
- Microservices from day one: operational overhead with no scaling pressure to justify it.
- Nx instead of Turborepo: more features, more configuration, plugin maintenance. Turborepo works on plain npm scripts, which is all this project needs.
