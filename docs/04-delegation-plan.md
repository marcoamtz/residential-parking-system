# Planning and delegation

> Skeleton. Deliverable 2 of the brief. Written in first person because the brief asks what I would keep and what I would delegate.

## Work breakdown

- Table of modules with owner, dependencies, and a definition of done: domain engine, schema and migrations, API routes, auth middleware, cache layer, resident page, admin page, CI, local infrastructure, documentation.
- Critical path: schema and domain engine first; everything else builds against them. Mock-first contracts let the web work start on day one.

## What I keep and what I delegate, and why

- Keep: domain engine and ranking rule, schema and constraints, draw transaction, event contract for cameras, review of every migration.
- Delegate: web pages against a mocked API, cache adapter behind an interface, CI pipeline, seed data and fixtures, documentation of endpoints from code.
- The rule: I keep what encodes an invariant or a contract that others depend on. I delegate what has a clear interface and a testable definition of done.

## License plate recognition delegation plan

- Breakdown into: event contract and webhook (keep), recognition pipeline (delegate to an engineer with computer vision experience), edge hardware and network (delegate to infrastructure), occupancy model and state machine (keep), live UI (delegate to a front-end developer).
- Sequencing and the integration milestone: replay recorded events through the webhook before any camera is installed.
- How the team collaborates: contract first, recorded fixtures shared by both sides, a weekly integration check against staging. Link to [ADR-0009](adr/0009-lpr-as-async-event-subsystem.md).

## Estimates and risk

- Rough sizing per module in ideal days, with the assumption stated.
- Top three risks and their mitigations: fairness rule disputes (publish the rule and the verification record), camera vendor payload variance (adapter per vendor behind the contract), scope creep on the admin UI (explicit out-of-scope list).
