# Team and communication

Written in first person because the brief asks how I would keep a team aligned and how I would bring a junior developer in.

## How decisions are made

**Architecture decision records.** Anything that is hard to reverse gets a record in `docs/adr` before the code: a storage choice, a contract with an external system, a change to the fairness rule, a security control. The format is short by design (context, decision, consequences, alternatives) so writing one takes under an hour. Anyone on the team can open one. I respond within one working day with approval or specific questions, so a decision never blocks work for more than a day. Once accepted a record is not edited; a new record supersedes it, which keeps the reasoning trail honest.

**Everything else** is decided by the owner of the module and surfaced in the pull request description. If a reviewer disagrees, the discussion happens in the review; if it cannot be settled there in a day, it becomes an ADR.

**Changes to the fairness rule** are special. They are policy, not engineering. They need an ADR, an announcement to residents before the next cycle opens, and they never apply to a cycle that is already open.

## Cadence

| Ritual | When | Length | Purpose |
| --- | --- | --- | --- |
| Daily sync | Every working day | 10 minutes | Blockers only. Status lives in the board, not in the meeting. |
| Weekly planning | Monday | 45 minutes | Pull work for the week against the breakdown in [04-delegation-plan.md](04-delegation-plan.md); confirm owners and definitions of done. |
| Weekly design sync | Thursday | 30 minutes | Open ADRs, contract changes, anything cross-cutting. Skipped if the agenda is empty. |
| Written summary | After planning and design sync | Async | Decisions and owners, posted where the team reads. Nobody should need to have been in the room. |
| Retrospective | End of each cycle of work (monthly) | 30 minutes | Three things to keep, three to change. |

Async first: questions go in writing with enough context to be answered without a call. Meetings are for decisions that need everyone in the same minute.

## Code review

- Every change lands through a pull request, including my own; the pull request is the review record even when I am the only engineer. `main` is protected with the rule applied to administrators too: pull request required, the three CI checks green on an up-to-date branch, linear history, signed commits, conversations resolved, no force pushes or deletion. There is no bypass; a solo repository is where the habit is built.
- **Size.** Soft limit of 400 changed lines, excluding lockfiles and generated migrations. Above that, the author splits the work or explains in the description why it cannot be split. Small pull requests get reviewed the same day; large ones wait, which is the incentive.
- **Who reviews what.** I review anything touching `packages/db` (schema, migrations), the draw transaction, authentication and authorization, and external contracts. Everything else is reviewed by a peer; I am not a bottleneck on web views or fixtures.
- **Turnaround.** First response within one working day. A review that will take longer says so.
- **The checklist** lives in `.github/PULL_REQUEST_TEMPLATE.md` so it is in front of the author before the reviewer: tests for domain changes, migration compatibility, cache bump on resident-visible writes, resident identity from the session only, no personal data in logs, accessible UI, and an ADR for anything hard to reverse.
- **Tone.** Questions over directives. Every comment says whether it blocks the merge. Nits are prefixed as nits. Praise is specific or omitted.
- **Before the review starts.** Git hooks catch what a reviewer should never have to mention: Biome formats and lints staged files at commit time, the commit message must follow Conventional Commits, and typecheck plus the database-free tests run before push. `LEFTHOOK=0` skips a hook when there is a reason; CI runs the same gates, including the commit-subject rule over every commit in a pull request and the package-boundary check, so skipping never bypasses them.

**Definition of done** for any task: merged to `main`, CI green, documentation updated if behavior changed, and demonstrated in staging when there is a user-visible change.

## Onboarding a junior developer

### The first day

1. Clone, `docker compose up -d`, `pnpm install`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`. The README is the only guide. If any step needs a person, the README is the bug.
2. Sign in as `unit104@parking.local`, register for the open cycle. Sign in as `admin@parking.local`, run the draw, look at the results. Thirty minutes of using the thing before reading any code.
3. Read the ADR index, then ADR-0003 and ADR-0004. Skip the rest for now.
4. Read `packages/domain/src/draw.ts` and its tests. It is the smallest complete piece of the system and has no I/O.
5. Pick up the starter task below. I pair for the first hour.

What I explain out loud on day one, because it is not obvious from the code: the fairness rule in one sentence, why the cache is never allowed to matter for correctness, and why no resident route ever takes a resident id from the request.

### The starter task: withdraw a registration

This task is intentionally unimplemented and tracked as [issue #12](https://github.com/marcoamtz/residential-parking-system/issues/12) with the `good first issue` label. It touches one route, one query, one cache bump, and one test, and every piece has an existing example next to it. It is small enough to finish in a day and real enough to ship.

**User story.** As a resident registered for the open cycle, I want to withdraw so that I am not allocated a spot I no longer need.

**Acceptance criteria.**
1. `DELETE /api/resident/register` removes my registration from the building's open cycle and returns `204`.
2. If I am not registered for the open cycle, it returns `404` with code `not_registered`.
3. If the building has no open cycle, it returns `409` with code `no_open_cycle`.
4. Registrations in drawn cycles can never be removed. The route only ever targets the open cycle, so this is guaranteed by construction; a test proves it.
5. After a successful withdraw, `GET /api/resident/status` shows `upcoming.registered: false` immediately, not after the cache TTL.
6. The resident view shows a "Withdraw" button next to the "Registered" badge, using the same `AlertDialog` confirmation the admin draw uses.

**API contract.**
```
DELETE /api/resident/register
Headers: Cookie: session=...; X-Requested-With: parking-web
204 No Content
404 { "code": "not_registered", "message": "..." }
409 { "code": "no_open_cycle", "message": "..." }
```
Resident identity comes from the session claims via `residentIdOf`. The route takes no parameters and no body.

**Where the pieces go.**
- Query: `withdrawFromOpenCycle(db, residentId, buildingId)` next to `registerForOpenCycle` in `apps/api/src/resident/status.ts`. Find the open cycle, `DELETE ... WHERE cycle_id AND resident_id RETURNING id`, map zero rows to `404`.
- Route: `.delete("/register", ...)` in `apps/api/src/resident/routes.ts`, after the `post`. Call the query, then `deps.cache.bump(user.buildingId)`, then `c.body(null, 204)`.
- Client: `resident.withdraw` in `apps/web/src/lib/api.ts`; the typed client picks up the new route automatically.
- UI: `ResidentView.tsx`, next to the `Registered` badge.
- Docs: one row in the resident table of `docs/03-api.md`, and remove the sentence saying withdraw is not implemented.

**Test checklist.** Integration tests in `apps/api/src/resident/register.test.ts`, following the fixture helpers in `apps/api/src/admin/draw.test.ts`:
- [ ] Register then withdraw: the registration row is gone and status reports `registered: false`.
- [ ] Withdraw without a registration: `HttpError` with status 404 and code `not_registered`.
- [ ] Withdraw when the building has no open cycle: 409 `no_open_cycle`.
- [ ] Draw the cycle, then attempt withdraw: 409 `no_open_cycle`, and the allocation for that registration still exists.
- [ ] The cache version is bumped exactly once on success and not at all on failure (use `NullCache` with a spy, or assert on the Redis key in an integration setting).

**Review focus.** I will look at three things: that the resident id never comes from the request, that the cache bump is after the database write and outside any transaction, and that the 404/409 distinction is tested. If those three are right, the rest is style.

**After the first pull request.** Review only, no pairing, for the next two tasks. A weekly 30 minute check-in for the first month, then the normal cadence. The second task is typically a web-side change (the accessibility pass on the admin table, for example) so they see both ends of the typed contract early.

## Working with the building administrators

They are the users of the admin screen and the people who answer residents' questions. Before each cycle opens I send them the one-sentence rule and the dates. After each draw they can point residents to the seed and the results screen. Any change to the rule is announced to them first, in writing, with the ADR attached.

## Documentation practice

- `README.md` answers "how do I run it".
- `docs/` answers "why is it like this". The numbered documents are deliverables; the ADRs are the reasoning.
- Code comments answer "what is not obvious here" and nothing else.
- `docs/03-api.md` is kept in step with the route files; a pull request that changes a route changes the page.
- Nothing is documented in two places. When a fact moves, the old location links to the new one.
