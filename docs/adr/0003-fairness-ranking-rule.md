# ADR-0003: Fairness ranking rule for the quarterly draw

Status: Accepted, 2026-09-06

## Context

Spots rotate every three months. Residents register for each cycle. There are usually more entrants than spots. Residents must be able to understand why they did or did not get a spot, and an administrator must be able to prove a draw was not manipulated.

A pure random draw clusters: one resident can win consecutive cycles while another never wins. A weighted lottery with tuned constants fixes clustering statistically but cannot be explained in one sentence, and every constant invites the question "why that number".

## Decision

The draw is a deterministic ranking, not a lottery. For each cycle, registered residents are sorted by:

1. Cycles since their last allocation, descending. Never allocated ranks first.
2. Lifetime allocations, ascending.
3. Lifetime registrations that did not result in an allocation, descending.
4. A pseudo-random tie-break seeded from a cryptographically random value generated at draw time.

The top N entrants receive spots, where N is the number of active spots in the building. Spots are assigned to winners by a shuffle using the same seed.

The draw is a pure function: `(cycle, entrants with history, active spots, seed) -> allocations`. The seed and an input snapshot are stored with the cycle so any draw can be replayed and verified.

## Consequences

- Rotation falls out of rule 1. A resident who held a spot last cycle has the smallest possible distance and ranks last. No separate exclusion rule is needed.
- When spots equal or exceed entrants, everyone wins, including last cycle's holders. This is correct: there is no scarcity to arbitrate.
- Rule 3 separates a new resident from one who has entered five times and lost. Both are "never allocated"; the persistent entrant goes first.
- The rule reads in one sentence: longest wait first, then fewest wins, then most attempts, then a coin flip.
- Ranking needs integer cycle sequence numbers per building, which the schema provides.
- Spot preference and accessibility requirements are not part of the rule. They are the first planned extension and are tracked in the domain documentation.

## Alternatives considered

- Pure random: simplest, but permits consecutive wins and long droughts.
- Weighted probability with penalty and bonus constants: harder to explain, constants are arbitrary, and outcomes are still probabilistic.
- Fixed round-robin by unit number: breaks when residents move in or out, and ignores who actually wants a spot.
- Hard exclusion of previous winners plus random among the rest: two rules where one suffices, and it behaves badly when spots exceed entrants.
