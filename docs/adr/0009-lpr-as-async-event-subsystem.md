# ADR-0009: License plate recognition as an asynchronous event subsystem

Status: Accepted, 2026-09-06

## Context

The brief asks the system to lay foundations for real-time vehicle detection with license plate cameras, and to show how that work would be broken down and delegated. The core allocation system must not depend on cameras being present or reliable.

## Decision

Cameras are producers of events, not participants in the allocation domain. The boundary is a single ingestion endpoint and a single event contract:

- Event contract: `camera_id`, `plate`, `direction` (enter or exit), `captured_at`, `confidence`, and an opaque `evidence_ref`. Versioned. Owned by the core team.
- Ingestion: an authenticated webhook on the API. Requests are signed with a per-camera shared secret using HMAC, rate limited, and acknowledged after being placed on a Redis-backed queue. Nothing about recognition quality affects the acknowledgement.
- Processing: a worker drains the queue, matches plates to registered vehicles, writes a `vehicle_events` row, and updates a spot's occupancy state. Unmatched plates are recorded for administrator review.
- Presentation: the resident and admin pages subscribe to occupancy changes over server-sent events.

Work split: the contract, the webhook, the storage model, and the occupancy state machine stay with the lead. The capture pipeline (stream handling, plate detection, character recognition), edge hardware, and the live UI are delegated, each against the contract above.

## Consequences

- The recognition pipeline can be built, tested, and replaced independently. A vendor camera that posts its own JSON needs only an adapter to the contract.
- Bursts (several cars arriving at once) are absorbed by the queue rather than by PostgreSQL write locks.
- The allocation domain stays pure. Occupancy is a separate concern that reads allocations; it never writes them.
- Plates are personal data and are encrypted at the column level and excluded from logs (ADR-0008).

## Alternatives considered

- Cameras write directly to the database: couples the schema to vendor payloads and makes bursts a database problem.
- Synchronous recognition inside the API request: ties API latency to model inference and camera network conditions.
