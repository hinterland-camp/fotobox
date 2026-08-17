# Build context is the monorepo root — the web app depends on @fotobox/shared.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS build
# better-sqlite3 compiles a native addon when no prebuild matches
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Manifests first so dependency installs stay cached across source edits
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/

# Only the web app and its workspace deps — skips Electron entirely
RUN pnpm install --frozen-lockfile --filter "@fotobox/web..."

COPY packages/shared packages/shared
COPY apps/web apps/web

RUN pnpm --filter @fotobox/shared build
RUN pnpm --filter @fotobox/web build

FROM base AS runtime
ENV NODE_ENV=production
ENV NITRO_PORT=3000
ENV NITRO_HOST=0.0.0.0

# Nitro bundles the server and its native deps into .output
COPY --from=build /app/apps/web/.output ./.output
# Read at runtime from the working directory by /api/branding
COPY --from=build /app/apps/web/branding.json ./branding.json

# Photos and the SQLite database live here — mount both as volumes
RUN mkdir -p /app/uploads /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
