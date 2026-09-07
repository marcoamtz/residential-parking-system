# API

> Skeleton. Lists the endpoints the prototype exposes and the rules every endpoint follows. Filled in from the route definitions once implemented so it never drifts from code.

## Conventions

- JSON in and out. Zod validation on every input. Errors are structured with a stable `code` field.
- Authentication and authorization per [ADR-0008](adr/0008-mock-auth-jwt-cookie-rbac.md). Resident routes derive identity from the session, never from the request body.

## Endpoints

- Auth: development login, logout, current user.
- Resident: status (current allocation, next cycle, registration state), register for the open cycle, withdraw.
- Admin: list and create cycles, run a draw, view draw results and the verification record, manage spots.
- Health.

## Caching behavior

- Which responses are cached, the key shape, and which writes bump the building version. Link to [ADR-0005](adr/0005-redis-cache-aside-with-version-key.md).
