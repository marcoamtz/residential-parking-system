# syntax=docker/dockerfile:1
# Build context is the repository root: docker build -f apps/web/Dockerfile .

ARG NODE_VERSION=24
ARG PNPM_VERSION=10.33.4

# ---- prune the workspace to what the web app needs (includes the API for its route types) ----
FROM node:${NODE_VERSION}-alpine AS pruner
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2 prune @parking/web --docker

# ---- install and build the static bundle --------------------------------------------------------
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
RUN pnpm --filter @parking/web build

# ---- runtime: nginx serving static files and proxying /api to the API service -------------------
FROM nginx:1.27-alpine AS runner
ENV API_UPSTREAM=http://api:3000
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
