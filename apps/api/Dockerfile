# syntax=docker/dockerfile:1
# Build context is the repository root: docker build -f apps/api/Dockerfile .

ARG NODE_VERSION=24
ARG PNPM_VERSION=10.33.4

# ---- prune the workspace to what the API needs -------------------------------------------
FROM node:${NODE_VERSION}-alpine AS pruner
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2 prune @parking/api --docker

# ---- install and bundle ----------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS builder
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /repo/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
# The root prepare script (git hooks) must exist for install; it is a no-op without a .git directory.
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
# turbo prune copies package manifests only; shared root config is added explicitly.
COPY tsconfig.base.json ./
RUN pnpm --filter @parking/api build

# ---- runtime: Node.js plus two bundled files, no node_modules -------------------------------
FROM node:${NODE_VERSION}-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /repo/apps/api/dist ./dist
COPY --from=builder --chown=node:node /repo/packages/db/drizzle ./drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
# Migrations run as a separate one-off task, never at startup:
#   docker run --rm <image> node dist/migrate.js
CMD ["node", "dist/index.js"]
