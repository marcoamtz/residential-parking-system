# Team and communication

> Skeleton. Deliverable 4 of the brief. Written in first person.

## How decisions are made

- Anything hard to reverse gets an ADR before code. Anyone can propose one; I approve or ask for changes within a day so decisions do not block work.
- Small decisions are made by the owner of the module and surfaced in the pull request.

## Cadence

- Short daily sync focused on blockers. Weekly planning against the work breakdown. A written summary after each planning session so people who missed it can catch up asynchronously.
- Refinement happens in the pull request template and the issue template, not in meetings.

## Code review

- Every change through a pull request with at least one reviewer. I review anything touching the schema, the draw, or authentication.
- Review checklist lives in the pull request template: constraint or migration safety, no personal data in logs, tests for domain changes, types propagated without escape hatches, accessible UI.
- Review tone: questions over directives, and the reviewer states whether a comment blocks the merge.

## Onboarding a junior developer

- Day one: run the stack locally with the README, read the ADR index, pick up a documented starter task.
- First task, concretely: implement the withdraw-registration endpoint. It touches one route, one query, one cache bump, and one test, and every piece has an existing example to copy. Definition of done is written in the issue.
- Pairing on the first pull request, then review-only. Weekly check-in for the first month.
- What I explain up front: the one-sentence fairness rule, why the cache is never required for correctness, and why resident ids never come from the request body.

## Documentation practice

- README answers "how do I run it". `docs/` answers "why is it like this". Code comments answer "what is non-obvious here". Nothing is documented twice.
- Endpoint documentation is generated from route definitions so it cannot drift.
