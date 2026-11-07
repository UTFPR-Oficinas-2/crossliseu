# syntax=docker/dockerfile:1

# Node version: keep every FROM node:… tag in sync with /.nvmrc.

# ---- deps: dependencies only, cached until package*.json changes ----
FROM node:26.13.0-trixie AS deps

WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package*.json ./

# The stamp lets the dev entrypoint detect a stale node_modules volume
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    npm ci && sha256sum package-lock.json > node_modules/.lockfile.sha256

# ---- dev: used by compose.yml for local development (Vite dev server) ----
FROM deps AS dev

# compose.yml keeps node_modules in a named volume, which Docker seeds from the
# image only once and never refreshes. Reinstall when package-lock.json changed.
COPY --chmod=755 <<'EOF' /usr/local/bin/dev-entrypoint
#!/bin/sh
set -e
if ! sha256sum --status -c node_modules/.lockfile.sha256 2>/dev/null; then
    if [ ! -w node_modules ]; then
        echo "node_modules is not writable by $(id -un). It is probably an old volume" >&2
        echo "created as root: docker compose down && docker volume rm <project>_web_node_modules" >&2
        exit 1
    fi
    echo "package-lock.json changed, running npm ci..."
    npm ci
    sha256sum package-lock.json > node_modules/.lockfile.sha256
fi
exec "$@"
EOF

COPY --chown=node:node . .

EXPOSE 5173

ENTRYPOINT ["dev-entrypoint"]
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---- build: produce static files ----
FROM deps AS build

COPY --chown=node:node . .

# URL path the app is served under, e.g. /crossliseu/ for https://ediasv.dev/crossliseu/
ARG BASE_PATH=/

# apps/api base URL inlined by Vite at build time, e.g. /crossliseu/api (required)
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build-only -- --base="${BASE_PATH}"

# ---- prod: NGINX (non-root, port 8080) serving the static build ----
FROM nginxinc/nginx-unprivileged:1.31.7-alpine AS prod

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
