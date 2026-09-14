# ADR-0008: Mock authentication with JWT cookie and role checks

Status: Accepted, 2026-09-06

## Context

The brief asks for at least a mock authentication and authorization implementation, plus protection against common web vulnerabilities. The prototype needs two roles: a resident who can see and act on their own data, and an administrator who can manage a building's cycles and spots.

## Decision

- Identity is mocked: users are seeded, and a development login endpoint issues a session for a chosen user with no password. The mock is confined to one route so it can be replaced without touching anything else.
- Sessions are signed JWTs carrying user id, role, and building id, stored in a cookie flagged `HttpOnly` and `SameSite=Strict`, plus `Secure` in production. Scripts cannot read the token, and cross-site requests do not carry it.
- Authorization is middleware: resident routes resolve the resident from the token and never accept a resident id from the request; admin routes require the admin role and scope every query to the admin's building.
- SQL injection is prevented by parameterized queries throughout the data layer. Cross-site scripting is prevented by React's default escaping; no HTML is rendered from user input.
- Mutating requests additionally require a custom header that browsers only send from same-origin script, as a second layer against cross-site request forgery.

## Consequences

- Swapping to a real identity provider means replacing the login route with an OIDC callback that issues the same cookie. Nothing downstream changes.
- Resident personal data is limited to name, unit, and contact email in the prototype. When license plates arrive they are encrypted at the column level so a database dump does not expose them.
- Personal data is excluded from application logs by policy, enforced in code review.

## Alternatives considered

- Bearer tokens in local storage: readable by any script on the page. Rejected.
- Server-side sessions in Redis: viable, but makes the cache required for login, which conflicts with the rule that Redis is never required for correctness.
- Skip authorization in the prototype: would leave the most common real-world bug class (missing ownership check) undemonstrated.

## Amendment, 2026-09-14: the `Secure` flag follows the environment

`Secure` is set when `NODE_ENV=production` (`cookieSecure` in `apps/api/src/env.ts`); local development runs over plain HTTP, where a `Secure` cookie would never be returned by the browser. `HttpOnly` and `SameSite=Strict` are set in every environment. The decision bullet above was qualified accordingly; the earlier unqualified wording was repeated in docs/03, docs/05, and docs/07 and has been corrected there too.
