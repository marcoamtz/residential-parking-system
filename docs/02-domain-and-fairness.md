# Domain model and fairness

This document explains the allocation rule the way it should be explained to a resident, then documents the data model that makes the rule enforceable. The rule itself is decided in [ADR-0003](adr/0003-fairness-ranking-rule.md); the implementation is `executeDraw` in `packages/domain/src/draw.ts`.

## Vocabulary

Same words in code, documentation, and the user interface.

| Term | Meaning |
| --- | --- |
| Building | The tenant. Every resident, spot, and cycle belongs to exactly one. |
| Resident | A household member eligible to enter draws. Identified by unit. Keeps history after moving out; cannot register after `moved_out_at` is set. |
| Spot | A physical parking space. Can be deactivated; existing allocations are untouched, future draws skip it. |
| Cycle | One quarter. Has a per-building `sequence` (1, 2, 3, ...), a period (`starts_on`, `ends_on`), and a status. |
| Registration | A resident's entry into one cycle's draw. At most one per resident per cycle. |
| Allocation | A registration that won a spot in its cycle. The allocations table is the history. |
| Draw | The single event that turns a cycle's registrations into allocations. Recorded once per cycle with its seed and input. |

## Cycle lifecycle

```mermaid
stateDiagram-v2
  [*] --> open: administrator creates cycle
  open --> drawn: administrator runs draw (single transaction)
  drawn --> [*]
```

Two states are enough. Registration is allowed while `open`. The draw flips the status and writes allocations in the same transaction, so there is never a visible intermediate state ([ADR-0004](adr/0004-draw-idempotency-via-cycle-state.md)).

The rotation worker runs the same draw on a schedule: an open cycle is drawn `DRAW_LEAD_DAYS` (default 7) before it starts and the following quarter is opened in the same run, so residents know their spot a week ahead and registration never has a gap ([ADR-0012](adr/0012-rotation-worker-with-bullmq.md)). The administrator's button remains for the first cycle and for exceptions, including a quarter already in progress when the worker recovers from downtime, which the policy skips so that every automatically opened cycle has a registration window.

- The **current** cycle for a resident is the drawn cycle whose period contains today. Their spot, if any, is the allocation in that cycle.
- The **upcoming** cycle is the building's open cycle, the one accepting registrations. A partial unique index guarantees there is at most one.
- The **next** allocation, in the API's vocabulary, is the resident's result in a drawn cycle that has not started yet: the rotation worker draws a week ahead, so for that week a resident has a current spot, a next result, and an upcoming registration.
- Periods are calendar dates in UTC. Building-local time zones are a known simplification (see limits below).

## The ranking rule, explained for residents

The draw is not a lottery. It is a sorted list. Everyone who registered is ordered by four keys, and the first N people get spots, where N is the number of active spots.

1. **Longest wait first.** How many cycles since you last had a spot. Never had one? You go to the front.
2. **Fewest spots ever.** Among equal waits, whoever has had fewer spots over their whole history goes first.
3. **Most attempts.** Among ties on both, whoever has entered and lost more often goes first.
4. **A coin flip you can check.** Remaining ties are broken by a random value derived from the draw's seed and your registration id.

One sentence: longest wait first, then fewest wins, then most attempts, then a seeded coin flip.

Rotation follows from rule 1 without a special case. If you held a spot last quarter, your wait is 1, the smallest possible, so you are behind everyone who has waited longer. When there are more spots than entrants, everyone gets one, including you; there is no scarcity to arbitrate.

### A real draw, step by step

The development fixture (`pnpm db:seed`) is deterministic: seeds and ids are pinned, so the numbers below are identical on every machine. Cycle 2 had ten entrants for four spots.

| Unit | History before cycle 2 | Wait | Wins | Attempts without a spot | Rank | Spot |
| --- | --- | --- | --- | --- | --- | --- |
| 201 | Entered cycle 1, lost | never | 0 | 1 | 1 | P4 |
| 101 | Entered cycle 1, lost | never | 0 | 1 | 2 | P1 |
| 104 | Entered cycle 1, lost | never | 0 | 1 | 3 | P3 |
| 302 | First entry | never | 0 | 0 | 4 | P2 |
| 303 | First entry | never | 0 | 0 | – | none |
| 304 | First entry | never | 0 | 0 | – | none |
| 102 | Won cycle 1 (P3) | 1 | 1 | 0 | – | none |
| 103 | Won cycle 1 (P1) | 1 | 1 | 0 | – | none |
| 202 | Won cycle 1 (P2) | 1 | 1 | 0 | – | none |
| 301 | Won cycle 1 (P4) | 1 | 1 | 0 | – | none |

Reading it:

- Rule 1 splits the field. Six residents have never had a spot; four held one last quarter. All six never-allocated residents rank above all four holders, however the rest falls.
- Rule 2 does not separate anyone here: every never-allocated resident has zero wins, every holder has one.
- Rule 3 orders the six. Units 201, 101, and 104 entered cycle 1 and lost, so they have one attempt without a spot; units 302, 303, and 304 are entering for the first time. Persistence wins: the three previous losers take ranks 1 to 3.
- Rule 4 decides the last spot. 302, 303, and 304 are a complete tie on the first three rules. The seeded tie-break gave the fourth spot to 302. With a different seed it could have been 303 or 304; with this seed it is always 302.
- The four holders from cycle 1 rank last. Wait 1 is the smallest possible value. With four spots and six residents ahead of them, none of them gets a spot this quarter.

What happens next is also predictable. Cycle 3 is open with six entrants: 101 and 302 hold spots now (wait 1), 102, 103, and 202 held spots in cycle 1 (wait 2, one attempt without a spot each), and 203 has never had a spot. When the administrator runs the draw, 203 ranks first and 102, 103, and 202 fill the remaining three spots in an order decided by the seed; 101 and 302 go without. If unit 104 registers before the draw, they rank with 101 and 302 and also go without, because they hold a spot this quarter.

The rule is covered by unit tests in `packages/domain/src/draw.test.ts` (15 cases, including "puts a never-allocated resident ahead of last quarter's winner" and "ranks fewer lifetime wins first when the wait is equal", which exercises rule 2) and by the integration test "ranks a never-allocated resident above last cycle's winner in the next cycle" in `apps/api/src/admin/draw.test.ts`, which runs two consecutive draws against PostgreSQL.

### How a resident can verify a draw

Every drawn cycle has a verification record, and every resident can fetch it for their own building: `GET /api/resident/draws/:cycleId` (linked from each row of the history table as "Verification record"). It contains:

- `seed`: generated with `crypto.randomBytes` at draw time, so nobody could predict tie-breaks beforehand, and recorded, so nobody can dispute them afterwards.
- `input`: exactly what `executeDraw` received. Entrants appear as registration ids with their three history numbers (cycles since last allocation, lifetime allocations, unsuccessful registrations); spots appear with their ids and labels. No names, units, or resident ids: a resident can check the draw without learning who else lives in the building. `yourRegistrationId` tells the caller which entry is theirs.
- `allocations`: what the draw produced, as registration id, spot id, and rank.

Replaying is one function call, and the function is pure:

```ts
import { executeDraw } from "@parking/domain";
const record = await fetch("/api/resident/draws/<cycleId>").then((r) => r.json());
const replay = executeDraw(record.input);
// replay.allocations must equal record.allocations
```

The integration test "publishes a record that replays to the stored allocations and hides resident identities" in `apps/api/src/draws/verification.test.ts` does exactly this, and also asserts that no resident id, name, or email appears in the record. Because the function ignores the order entrants are supplied in, the replay cannot be gamed by reordering.

## Data model

```mermaid
erDiagram
  buildings ||--o{ residents : has
  buildings ||--o{ users : has
  buildings ||--o{ parking_spots : has
  buildings ||--o{ raffle_cycles : has
  residents |o--o| users : "login for"
  raffle_cycles ||--o{ raffle_registrations : accepts
  residents ||--o{ raffle_registrations : enters
  raffle_registrations |o--o| spot_allocations : "may win"
  parking_spots ||--o{ spot_allocations : "assigned in"
  raffle_cycles ||--o| raffle_draws : "verified by"
  users |o--o{ raffle_draws : executes
```

Schema: `packages/db/src/schema.ts`. Migration: `packages/db/drizzle/0000_initial_schema.sql`.

### Constraints and the invariant each one enforces

| Constraint | Invariant |
| --- | --- |
| `spot_allocations` UNIQUE `(cycle_id, spot_id)` | A spot is allocated at most once per cycle. |
| `spot_allocations` UNIQUE `(registration_id)` | A registration wins at most once. |
| `spot_allocations` FK `(registration_id, cycle_id)` → `raffle_registrations (id, cycle_id)` | A winner must have registered for that same cycle. An allocation cannot point at a registration from another cycle. |
| `spot_allocations` UNIQUE `(cycle_id, rank)` | Ranks within a draw are distinct, so the published order is unambiguous. |
| `raffle_registrations` UNIQUE `(cycle_id, resident_id)` | One entry per resident per cycle. |
| `raffle_cycles` UNIQUE `(building_id, sequence)` | Cycle distances used by the ranking rule are well defined. |
| `raffle_cycles` partial UNIQUE `(building_id) WHERE status = 'open'` | At most one cycle accepts registrations per building. |
| `raffle_cycles` CHECK `ends_on > starts_on`, `sequence > 0` | Periods and sequences are sane. |
| `raffle_draws` UNIQUE `(cycle_id)` | One verification record per cycle. |
| `users` CHECK `role = 'admin' OR resident_id IS NOT NULL` | A resident login is always linked to a resident. |
| `users` UNIQUE `(email)`, UNIQUE `(resident_id)` | One login per email, one login per resident. |
| `residents` UNIQUE `(building_id, email)` | No duplicate residents within a building. |
| `parking_spots` UNIQUE `(building_id, label)` | Spot labels are unambiguous within a building. |

Uniqueness is declared as table constraints rather than unique indexes so that they exist inside `CREATE TABLE`, before the composite foreign key that depends on one of them is added. The one partial uniqueness rule must be an index, because PostgreSQL has no partial unique constraint.

### Why history is not a separate table

The ranking rule needs three numbers per entrant: cycles since last allocation, lifetime allocations, and unsuccessful registrations. All three are aggregates over `raffle_registrations` left-joined to `spot_allocations` and `raffle_cycles`. Keeping a denormalized history or counters would introduce a second source of truth that could drift from the allocations; computing them in one query at draw time is cheap (a few hundred rows per building) and cannot be wrong. The query is `loadEntrants` in `apps/api/src/admin/draw.ts`.

### Indexes and the queries that use them

Every index in the schema, including the ones PostgreSQL creates for primary keys and unique constraints (`pg_indexes` on a migrated database lists exactly these 21).

| Table | Index | Kind | Query it serves |
| --- | --- | --- | --- |
| `buildings` | `(id)` | primary key | Foreign key targets; the worker's list of buildings |
| `residents` | `(id)` | primary key | Status lookup by session resident id; joins from registrations |
| `residents` | `(building_id, email)` | unique | Integrity; seed and future resident import by email within a building |
| `users` | `(id)` | primary key | Session claims to user; `executed_by_user_id` |
| `users` | `(email)` | unique | Development login by email |
| `users` | `(resident_id)` | unique | One login per resident |
| `parking_spots` | `(id)` | primary key | Joins from allocations |
| `parking_spots` | `(building_id, label)` | unique | Admin spot list (leading column), label uniqueness |
| `raffle_cycles` | `(id)` | primary key | Cycle by id in admin, draw, verification |
| `raffle_cycles` | `(building_id, sequence)` | unique | Cycle list and next sequence number; ranking distances |
| `raffle_cycles` | `(building_id) WHERE status = 'open'` | partial unique | The open cycle on every status read and registration; one-open-per-building invariant |
| `raffle_registrations` | `(id)` | primary key | Allocation to registration |
| `raffle_registrations` | `(cycle_id, resident_id)` | unique | "Is this resident registered for the open cycle"; entrants of a cycle for the draw and the admin results (leading column) |
| `raffle_registrations` | `(id, cycle_id)` | unique | Target of the composite foreign key from allocations; integrity only |
| `raffle_registrations` | `(resident_id)` | index | Resident history and ranking inputs across cycles |
| `spot_allocations` | `(id)` | primary key | Row identity |
| `spot_allocations` | `(registration_id)` | unique | Join from a registration to its allocation: history, admin results, ranking inputs, status |
| `spot_allocations` | `(cycle_id, spot_id)` | unique | Verification record and rotation queries by cycle (leading column); spot-once-per-cycle invariant |
| `spot_allocations` | `(cycle_id, rank)` | unique | Ordered allocations of a cycle; distinct ranks |
| `raffle_draws` | `(id)` | primary key | Row identity |
| `raffle_draws` | `(cycle_id)` | unique | Verification record by cycle; one draw per cycle |

The admin results screen starts from `raffle_registrations` filtered by cycle and left-joins allocations through `registration_id`, so it uses the registration index and the allocation `(registration_id)` index, not `(cycle_id, spot_id)`. No further indexes are planned until a query plan shows a need; at residential-building volumes every table fits in memory.

## Known limits and planned extensions

- **Spot preference and accessibility.** The rule assigns spots to winners in a seeded order, so no spot is systematically given to the top rank. It does not know that some residents need an accessible spot or that some spots are better. The first extension is a reserved-spot rule that runs before the general draw: residents flagged as needing an accessible spot are ranked by the same four keys among accessible spots, then everyone else is ranked among the remaining spots. The ranking rule does not change; it runs twice on partitioned inputs.
- **Households with more than one vehicle.** Out of scope. Modeling it means a `vehicles` table and a decision about whether a household can hold two spots in one cycle. That decision belongs to building rules, not to code, so it is deliberately left open.
- **Mid-cycle move-outs.** A resident who moves out keeps their history and cannot register. Their current allocation stays until the cycle ends. Releasing a spot mid-cycle and reassigning it (to the next ranked entrant of that draw, using the stored ranking) is a small, well-defined follow-up.
- **Time zones.** Dates are compared in UTC. A building in UTC-6 could see its cycle start a few hours late on the boundary day. The fix is a `timezone` column on `buildings` and computing "today" per building.
- **Quarter alignment.** The system does not force cycles onto calendar quarters. The administrator picks the period; the seed fixture uses calendar quarters because that is what the brief describes.
