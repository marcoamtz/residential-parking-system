# ADR-0002: PostgreSQL with Drizzle ORM

Status: Accepted, 2026-09-06

## Context

The domain is a finite set of physical spots allocated to residents per cycle. The invariants are relational: a spot is allocated at most once per cycle, a resident wins at most once per cycle, and only registered residents can win. Allocation history must be queryable for fairness ranking. Future camera telemetry needs a place to land without a schema redesign.

## Decision

PostgreSQL as the only source of truth. Invariants are expressed as constraints, not application checks:

- `UNIQUE (cycle_id, spot_id)` on allocations.
- `UNIQUE (registration_id)` on allocations, where the registration row already carries `(cycle_id, resident_id)` uniqueness. Only entrants can win.
- `UNIQUE (building_id, sequence)` on cycles so ranking can use integer cycle distances instead of dates.
- Every tenant-owned table carries `building_id`.

Drizzle ORM for schema definition, migrations, and queries. Schema is TypeScript, so types flow to the API and web packages without code generation.

## Consequences

- Concurrency safety comes from the database. Application code can be simple.
- History is the allocations and registrations tables joined to cycles. No separate audit or event table for the prototype.
- Drizzle stays close to SQL, so indexes and query plans are visible and tunable. There is no query engine binary to ship.
- JSONB is available for telemetry payloads when license plate events arrive.
- Cost: Drizzle is younger than Prisma or TypeORM. Accepted because the schema is small and the SQL surface is standard.

## Alternatives considered

- MongoDB: the invariants above would become application-level checks with retry logic. Wrong fit for a domain that is relational by nature.
- Prisma: excellent developer experience, but its query engine adds a runtime dependency and abstracts away the SQL that matters for index and constraint work.
- Raw SQL with a query builder: viable, but migrations and type inference would be hand-maintained.
