# ADR-0004: Draw idempotency via cycle state transition

Status: Accepted, 2026-09-06

## Context

A draw must run exactly once per cycle. Realistic failure modes are an administrator double-clicking, two administrators acting at the same time, or a scheduler retrying after a timeout. The naive fix is a serializable transaction with row locks on every spot, which is heavier than the problem.

## Decision

A cycle has a status of `open` or `drawn`. The draw runs in one transaction that starts with:

```sql
UPDATE raffle_cycles
SET status = 'drawn'
WHERE id = $1 AND status = 'open'
RETURNING id;
```

If zero rows return, another draw already claimed the cycle and the transaction aborts with a conflict response. The same transaction then inserts the `raffle_draws` verification row (seed, input snapshot, who ran it) and the allocations. Under PostgreSQL's default `READ COMMITTED` isolation, a concurrent transaction blocks on the row lock and then re-evaluates the `WHERE` clause against the committed row, so exactly one caller wins the transition.

The allocation constraints from ADR-0002 remain the hard invariant. If the state transition were ever bypassed, the database would still reject a second allocation for the same spot or registration, a second verification row for the same cycle, or an allocation whose registration belongs to a different cycle (composite foreign key).

## Consequences

- No `SERIALIZABLE` isolation, no `FOR UPDATE` on spot rows, no retry loop for serialization failures.
- Two independent layers protect the invariant: a state machine and unique constraints.
- Accepted risk: a spot deactivated by an administrator while a draw is mid-transaction can still be allocated in that draw. Spot changes are rare administrative actions. The prototype documents this rather than adding locking for it.

## Alternatives considered

- `SERIALIZABLE` transaction: correct, but requires retry handling for `40001` errors and obscures which invariant actually matters.
- Advisory lock per cycle: works, but adds a second mechanism when the status column already expresses the intent.
- Application-level mutex in Redis: adds a dependency on the cache for correctness. The cache must never be required for correctness.
