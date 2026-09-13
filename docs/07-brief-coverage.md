# Brief coverage

Every requirement in the assessment brief, in the brief's order, with its status and where the evidence is. Status values: **Built** (code, tests, verified), **Built and documented**, **Documented** (design and plan only, by decision). Nothing is marked built that a reviewer cannot run or read in this repository.

## Project scenario

| Requirement | Status | Evidence |
| --- | --- | --- |
| Manage parking spot allocation for a residential unit | Built | `packages/domain` (draw), `apps/api` (routes, transaction), `apps/web` (resident and admin views) |
| Rotate assignments every three months via a raffle | Built | Quarterly cycles in the schema; rotation worker draws a week before each quarter and opens the next ([ADR-0012](adr/0012-rotation-worker-with-bullmq.md)); administrator button for exceptions |
| Track which residents have already benefited, to ensure fairness | Built | History is the `raffle_registrations` and `spot_allocations` tables; ranking inputs computed in `loadEntrants` ([02-domain-and-fairness.md](02-domain-and-fairness.md)) |
| Lay foundations for real-time license plate recognition | Documented | [ADR-0009](adr/0009-lpr-as-async-event-subsystem.md), delegation plan in [04-delegation-plan.md](04-delegation-plan.md), issues #6–#11 |

### Emphasis of the assignment

| Priority | Where it shows |
| --- | --- |
| Architectural decisions | Twelve decision records in [adr/](adr/README.md); system shape in [01-architecture.md](01-architecture.md) |
| Clear, concise, professional documentation | `README.md` (cold start verified from an empty database), `docs/00`–`07`, endpoint documentation kept in step with routes |
| Scalability for future growth | Scaling path by stage in [01-architecture.md](01-architecture.md); `building_id` on every tenant table from day one |
| Tools and strategies for efficiency, maintainability, reliability | [05-tools-and-strategies.md](05-tools-and-strategies.md); CI, hooks, container images, observability |
| Communication and delegation with a team | [04-delegation-plan.md](04-delegation-plan.md), [06-team-and-communication.md](06-team-and-communication.md), pull requests #1–#16, issues #6–#12 |

## Core features to implement

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1a | Allow residents to register for the parking raffle | Built | `POST /api/resident/register`; "Register for this draw" in `ResidentView`; tests in `apps/web/src/views/ResidentView.test.tsx` |
| 1b | Allocate available parking spots fairly | Built | `executeDraw` in `packages/domain/src/draw.ts`, rule in [ADR-0003](adr/0003-fairness-ranking-rule.md); 15 unit tests; real-data walkthrough in [02-domain-and-fairness.md](02-domain-and-fairness.md) |
| 1c | Rotate assignments every 3 months | Built | `planRotation` in `packages/domain/src/rotation.ts` (9 tests); worker in `apps/api/src/scheduler` (4 PostgreSQL-backed tests); `pnpm scheduler --once` |
| 1d | Track residents' parking history to prioritize fairness | Built | History tables and the one-query ranking input in `apps/api/src/admin/draw.ts`; history table on the resident's page |
| 2a | A simple web interface (React, Angular, or plain JavaScript) | Built | `apps/web`: React 19, Vite, shadcn/ui ([ADR-0010](adr/0010-react-vite-spa.md), [ADR-0011](adr/0011-shadcn-ui-from-the-start.md)); 14 component tests |
| 2b | Residents can see their parking status and next allocation | Built | `GET /api/resident/status` returns `current`, `next` (the drawn cycle that has not started), `upcoming`, `history`; three cards in `ResidentView` |
| 3a | Store residents, allocations, and history in a database | Built | PostgreSQL 16, schema in `packages/db/src/schema.ts`, migration `0000_initial_schema.sql`, invariants as constraints ([ADR-0002](adr/0002-postgresql-with-drizzle.md)) |
| 3b | Implement caching for frequently accessed data | Built | Redis cache-aside for resident status keyed by a per-building version ([ADR-0005](adr/0005-redis-cache-aside-with-version-key.md)); `cache_requests_total{result}` metric |

## Architectural considerations

| Requirement | Status | Evidence |
| --- | --- | --- |
| Architecture diagram showing frontend, backend, database, caching layer, cloud infrastructure | Documented | Component diagram, two sequence diagrams, and the reference deployment diagram in [01-architecture.md](01-architecture.md) |
| Explain design decisions: framework, storage approach, deployment method | Documented | [ADR-0010](adr/0010-react-vite-spa.md) and [ADR-0006](adr/0006-hono-api-with-shared-types.md) (frameworks), [ADR-0002](adr/0002-postgresql-with-drizzle.md) (storage), deployment table and container images in [01-architecture.md](01-architecture.md) |
| Show how the system could scale with more residents or multiple buildings | Documented | Scaling table in [01-architecture.md](01-architecture.md): stateless API, per-building cache keys, `building_id` scoping today, RLS and pooling as next steps |

## Delegation plan for future features

| Requirement | Status | Evidence |
| --- | --- | --- |
| Break the task into smaller pieces | Documented | Six streams in [04-delegation-plan.md](04-delegation-plan.md); one GitHub issue each (#6–#11) under the "License plate recognition" milestone |
| Show which tasks are kept and which are delegated | Documented | Boundary table in [04-delegation-plan.md](04-delegation-plan.md); `owner:lead`, `owner:ml`, `owner:iot`, `owner:frontend` labels on the issues |
| Outline how the team would collaborate to integrate the feature | Documented | "Sequencing" and "How the team collaborates" in [04-delegation-plan.md](04-delegation-plan.md): contract first, shared fixtures, weekly integration check, definition of done per stream |

## Performance considerations

| Requirement | Status | Evidence |
| --- | --- | --- |
| Efficient handling of raffle operations and fairness checks | Built | One CTE query for all ranking inputs; pure sort in memory; short transaction; `draw_duration_seconds` histogram. Explained in [05-tools-and-strategies.md](05-tools-and-strategies.md) |
| Caching frequently requested queries (resident status, next allocation) | Built | Cache-aside with version-key invalidation on every resident-visible write; hit/miss metric |
| Database indexing and query optimization for allocation lookups | Built and documented | Constraints and indexes mapped to the queries that use them in [02-domain-and-fairness.md](02-domain-and-fairness.md) |

## Security considerations

| Requirement | Status | Evidence |
| --- | --- | --- |
| Secure storage of resident data | Built and documented | Minimal personal data (name, unit, email); no personal data in logs by construction; TLS and encrypted backups in the reference topology; column-level encryption specified for plates when they arrive ([ADR-0008](adr/0008-mock-auth-jwt-cookie-rbac.md), [05-tools-and-strategies.md](05-tools-and-strategies.md)) |
| Authentication and authorization (at least a basic mock) | Built | Password-less development login behind `MOCK_AUTH`; signed JWT in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie; role middleware; resident identity from claims only; admin queries scoped by building. Tests in `apps/api/src/app.test.ts` and `admin/draw.test.ts` |
| Protection against common vulnerabilities (SQL injection, XSS) | Built | Parameterized queries throughout; React escaping; custom-header CSRF guard; Zod whitelists. Threat-to-control table in [05-tools-and-strategies.md](05-tools-and-strategies.md) |
| Cloud security best practices if deploying | Documented | Least-privilege roles, private subnets, secrets in a managed store, image scanning, infrastructure as code, in [05-tools-and-strategies.md](05-tools-and-strategies.md) and the deployment diagram |

## Deliverables

| # | Deliverable | Status | Evidence |
| --- | --- | --- | --- |
| 1a | High-level system architecture diagram | Documented | [01-architecture.md](01-architecture.md), four Mermaid diagrams |
| 1b | Explanation of design choices and trade-offs | Documented | [adr/](adr/README.md), trade-off section in [05-tools-and-strategies.md](05-tools-and-strategies.md) |
| 1c | Scalability for larger residential complexes | Documented | Scaling table in [01-architecture.md](01-architecture.md) |
| 2a | Breakdown of tasks into components/modules | Documented | Work breakdown table in [04-delegation-plan.md](04-delegation-plan.md) |
| 2b | What the candidate builds versus delegates | Documented | "What I keep and what I delegate" in [04-delegation-plan.md](04-delegation-plan.md) |
| 2c | Delegation plan for advanced features (license plate recognition) | Documented | LPR section of [04-delegation-plan.md](04-delegation-plan.md); [ADR-0009](adr/0009-lpr-as-async-event-subsystem.md); issues #6–#11 |
| 3a | Technologies, frameworks, tools, and why | Documented | Stack and tooling tables in [05-tools-and-strategies.md](05-tools-and-strategies.md); one ADR per foundational choice |
| 3b | Performance strategies (caching, load balancing, indexing) | Documented | Performance section of [05-tools-and-strategies.md](05-tools-and-strategies.md) |
| 3c | Security strategies (data protection, auth, cloud) | Documented | Security section of [05-tools-and-strategies.md](05-tools-and-strategies.md) |
| 4a | Clear, structured documentation another team member could follow | Built and documented | `README.md` cold-start sequence verified from an empty database; `docs/` numbered by deliverable; endpoint docs in [03-api.md](03-api.md) |
| 4b | Communication plan (code reviews, sprint planning, decision-making) | Documented and practiced | [06-team-and-communication.md](06-team-and-communication.md); every change since the bootstrap landed through a pull request with the template; branch protection binds administrators |
| 4c | How to onboard or guide a junior developer | Documented | Day-one checklist and the withdraw-registration starter brief in [06-team-and-communication.md](06-team-and-communication.md); issue #12 |
| 5a | Proof-of-concept of the core allocation system | Built | Domain, API, web, worker; 57 automated tests (24 domain, 19 API, 14 web) run in CI against real PostgreSQL and Redis; container images built in CI |

## Deliberately not built

Listed so the omissions are decisions, not gaps: license plate recognition (planned and delegated), a real identity provider (swap path in ADR-0008), Row-Level Security and connection pooling (triggers in 01-architecture.md), column encryption for plates (applies when plates exist), a live cloud environment (images and topology exist; no account), and the withdraw-registration endpoint (the onboarding task, issue #12).
