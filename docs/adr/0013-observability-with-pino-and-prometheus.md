# ADR-0013: Observability with pino logs, Prometheus metrics, and split health endpoints

Status: Accepted, 2026-09-13 (recorded 2026-09-14; the implementation landed in pull request #5).

## Context

The API needed three things before it could be operated: a way to follow one request across nginx, the load balancer, and the process; numbers for the two questions this system actually has (is the cache working, how long do draws take); and a readiness signal a load balancer can route on. Resident data must never reach the logs (ADR-0008).

## Decision

- **Logs**: `pino`, JSON to stdout, one line per request with a fixed field set: request id, method, matched route pattern, path, status, duration. `X-Request-Id` is honored from a proxy or generated (`hono/request-id`) and echoed. Paths are logged for unmatched-route debugging; in this API they carry route names and UUIDs only, never resident data. Every logged error, in the HTTP handler, the rotation worker, and the cache client, goes through `describeError`, which keeps the SQL text with placeholders, the SQLSTATE, and the constraint name, and drops bound parameters, row values, and the values PostgreSQL quotes in its messages.
- **Metrics**: `prom-client` at `/api/metrics`: `http_requests_total` and `http_request_duration_seconds` by method and route pattern (bounded cardinality), `cache_requests_total{result}`, `draw_duration_seconds` (successful draws only), Node.js defaults. Not routed by the load balancer; blocked at the nginx edge.
- **Health**: `/api/health` is liveness and touches nothing; `/api/ready` runs `select 1` and returns 503 without PostgreSQL; Redis is reported but never fatal, matching ADR-0005.

## Consequences

- No collector or agent to run; any Prometheus-compatible scraper works, including CloudWatch's.
- Traces are not part of this decision. OpenTelemetry becomes worthwhile when the camera subsystem makes the request path multi-hop; the request id already gives cross-process correlation for the single hop that exists.
- Error tracking with alerting on the 5xx rate is the next addition and is documented as such.

## Alternatives considered

- OpenTelemetry from the start: the right long-term shape, but it needs a collector and answers questions this system does not yet ask.
- Vendor agents (Datadog, New Relic): fast to add, but they tie the prototype to a subscription for two counters and a histogram.
- `console.log`: no structure, no levels, no redaction; the review found resident data in exactly the kind of error log this decision replaces.
