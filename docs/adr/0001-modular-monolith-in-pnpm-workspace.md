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

## Amendment, 2026-10-25: how the boundaries are enforced

"Enforce boundaries at compile time" is carried by existing tools, not repository scripts. pnpm's strict resolution blocks undeclared packages. Biome's `noRestrictedImports`, configured per package in `biome.json`, rejects the forbidden workspace imports (the domain imports nothing from the workspace, `db` nothing from `api`, `web`, or `domain`, `api` never `web`, and `web` only `AppType` from `api`) in every syntactic form Biome parses, including re-exports, `import()` with a string literal, and `require()`; comments and type positions are ignored. Each package's `tsconfig.json` sets `rootDir: "."`, so a relative import that leaves the package fails typecheck with TS6059. They replace a repository script that matched imports with regular expressions, which both missed valid forbidden forms and rejected valid code; the two tools above already parse TypeScript. Known gap: a template-literal `import()` specifier is not checked.
