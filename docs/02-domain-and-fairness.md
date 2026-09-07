# Domain model and fairness

> Skeleton. Deliverable 1b and 5 of the brief. The ranking rule is final in [ADR-0003](adr/0003-fairness-ranking-rule.md); this document explains it for residents and administrators and documents the data model behind it.

## Vocabulary

- Building, resident, spot, cycle, registration, allocation. One line each. Same words in code, documentation, and the user interface.

## Cycle lifecycle

- `open`: residents register. `drawn`: allocations exist and the cycle has a start and end date. State diagram.
- How "current cycle" and "next cycle" are derived from dates and status.

## The ranking rule, explained for residents

- The one-sentence version: longest wait first, then fewest wins, then most attempts, then a coin flip.
- Three worked examples with a handful of residents showing why each ranks where they do, including the new-resident versus persistent-entrant case.
- How a resident can verify a draw: the seed and input snapshot are published per cycle.

## Data model

- Table list with columns, constraints, and indexes. Which constraint enforces which invariant.
- Why history is the allocations and registrations tables, not a separate log.
- Indexes justified by the queries that use them: resident status lookup, ranking inputs for a draw, admin cycle results.

## Known limits and planned extensions

- Spot preference and accessibility needs: first extension. Sketch of how a reserved-spot rule would layer on top of the ranking without changing it.
- Households with more than one vehicle: out of scope, note the modeling choice that would be needed.
- Mid-cycle move-outs: how an allocation is released and whether the spot is reassigned.
