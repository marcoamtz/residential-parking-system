# ADR-0014: Container images from single-file bundles on an unprivileged base

Status: Accepted, 2026-09-13 (recorded 2026-09-14; the implementation landed in pull requests #2 and #22).

## Context

The workspace has TypeScript-source packages consumed just in time by the API (`@parking/domain`, `@parking/db`). A runtime image that copied `node_modules` would have to reproduce pnpm's symlinked store and carry every development dependency, or use `pnpm deploy` and still ship source packages that nothing compiles at runtime.

## Decision

- `apps/api/Dockerfile`: `turbo prune @parking/api --docker` to minimize the build context, `pnpm install --frozen-lockfile`, then `tsup` bundles the server, the rotation worker, and the migrator into single ESM files with every dependency inlined (`noExternal: [/.*/]`, `pg-native` external). The runtime stage is `node:24-alpine`, runs as `node`, and contains `dist/` and the migration SQL only. One image, three entrypoints: `node dist/index.js`, `node dist/scheduler.js`, `node dist/migrate.js`.
- `apps/web/Dockerfile`: the same prune-and-install build, then `nginxinc/nginx-unprivileged:1.27-alpine` serving the static bundle on port 8080 as uid 101, proxying `/api/` to the API, setting the browser security headers, and returning 404 for `/api/metrics`.
- `docker-compose.images.yml` rehearses the topology locally; CI builds both images, scans them with Trivy (informational), and runs the rehearsal on every pull request.

## Consequences

- Runtime images have no `node_modules`, so there is nothing to `npm audit` inside them; supply-chain checks happen at build time.
- Bundling CommonJS dependencies into ESM needs a `createRequire` banner; its identifier is aliased so it cannot collide with a dependency's own import, which happened once with BullMQ.
- The worker shares the API image, so its health check must be process-based; the HTTP probe inherited from the image would never pass.
- Base images are pinned by tag. Digest pinning with automated updates is the next step; noted, not done.
- `turbo prune` copies package manifests only, so shared root files the build needs (`tsconfig.base.json`, `scripts/` for the prepare script) are copied explicitly.

## Alternatives considered

- Copy the installed workspace into the runtime image: several hundred megabytes of development dependencies and a pnpm store layout to reproduce.
- `pnpm deploy --prod`: works, but ships TypeScript source packages and their `package.json` files into an image that never compiles them.
- Distroless base: smaller attack surface, but no shell for the process-based worker health check and for the one-off migration task's debugging; revisit with a health endpoint on the worker.
