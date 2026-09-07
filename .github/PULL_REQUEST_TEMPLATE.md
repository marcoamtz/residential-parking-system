## What changes and why

<!-- One or two sentences. Link the issue or ADR that motivates the change. -->

## Packages touched

- [ ] `packages/domain`
- [ ] `packages/db`
- [ ] `apps/api`
- [ ] `apps/web`
- [ ] `docs`

## Checklist

- [ ] Domain logic changes have unit tests in `packages/domain`.
- [ ] Schema changes ship with a migration and do not break the previous API version.
- [ ] Any write that changes what residents see bumps the building cache version.
- [ ] Resident identity comes from the session, never from the request body.
- [ ] No personal data is written to logs.
- [ ] New UI is keyboard reachable and has labels for screen readers.
- [ ] A decision that would be hard to reverse has an ADR, or this PR adds one.

## How to verify

<!-- Commands or steps a reviewer can run. -->
