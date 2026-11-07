# syntax=docker/dockerfile:1

# Node version: keep every FROM node:… tag in sync with /.nvmrc.
# Dev/build and prod use the same Debian release (trixie) so native modules
# built in `build` (bcrypt) run in `prod`.

# ---- deps: dependencies only, cached until package*.json changes ----
FROM node:26.13.0-trixie AS deps

WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package*.json ./

# The stamp lets the dev entrypoint detect a stale node_modules volume
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    npm ci && sha256sum package-lock.json > node_modules/.lockfile.sha256

# ---- dev: used by compose.yml for local development (hot reload) ----
FROM deps AS dev

# compose.yml keeps node_modules in a named volume, which Docker seeds from the
# image only once and never refreshes. Reinstall when package-lock.json changed.
COPY --chmod=755 <<'EOF' /usr/local/bin/dev-entrypoint
#!/bin/sh
set -e
if ! sha256sum --status -c node_modules/.lockfile.sha256 2>/dev/null; then
    if [ ! -w node_modules ]; then
        echo "node_modules is not writable by $(id -un). It is probably an old volume" >&2
        echo "created as root: docker compose down && docker volume rm <project>_api_node_modules" >&2
        exit 1
    fi
    echo "package-lock.json changed, running npm ci..."
    npm ci
    sha256sum package-lock.json > node_modules/.lockfile.sha256
fi
exec "$@"
EOF

COPY --chown=node:node . .

EXPOSE 3000

ENTRYPOINT ["dev-entrypoint"]
CMD ["npm", "run", "start:dev"]

# ---- build: compile TypeScript, then drop devDependencies ----
FROM deps AS build

COPY --chown=node:node . .

RUN npm run build && npm prune --omit=dev

# ---- prod: small runtime image used on the VPS ----
FROM node:26.13.0-trixie-slim AS prod

ENV NODE_ENV=production

WORKDIR /app

# Owned by root so the app (running as node) cannot modify its own code
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node

EXPOSE 3000

# slim has no curl; Node's fetch is enough
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "dist/main.js"]
