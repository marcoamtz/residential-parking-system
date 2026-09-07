# Tools and strategies

> Skeleton. Deliverable 3 of the brief. Stack rationale lives in the ADRs; this document summarizes and covers performance and security strategy.

## Stack summary

- One table: layer, choice, one-line reason, link to the ADR that has the full reasoning.
- Development tooling: pnpm, Turborepo, TypeScript strict mode, Biome for lint and format, Vitest, Docker Compose. One line each on what problem it solves.

## Performance

- Draw: sorting a few hundred entrants is trivial; the cost is the transaction, kept short by computing outside and writing inside.
- Reads: cache-aside per [ADR-0005](adr/0005-redis-cache-aside-with-version-key.md). Which endpoints, expected hit rate, and how it is measured.
- Database: indexes listed against the queries that use them. Connection pooling when API instances exceed a handful. Read replicas are not needed at any realistic building count; stated plainly.
- Load balancing: stateless API, session in cookie, so any instance serves any request.

## Security

- Data protection: TLS everywhere, column-level encryption for plates when they arrive, no personal data in logs, backups encrypted at rest.
- Authentication and authorization per [ADR-0008](adr/0008-mock-auth-jwt-cookie-rbac.md).
- Common vulnerabilities: parameterized queries, React escaping, cookie flags, custom header on mutations, rate limiting on auth and webhook routes, dependency audit in CI.
- Cloud practices: least-privilege service roles, private networking for database and cache, secrets in a managed store, image scanning, infrastructure as code.

## Reliability and observability

- Structured logs with request ids. Metrics for request latency, cache hit rate, and draw duration. Error tracking. Health endpoint used by the load balancer.
- Backups and restore drill for PostgreSQL. What is lost if Redis is lost: nothing, by design.
