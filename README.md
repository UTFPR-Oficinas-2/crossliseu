<h1 align="center">Crossliseu</h1>

<p align="center">Championship management for the UTFPR robot battle arena.</p>

<p align="center">
  <a href="https://github.com/utfpr-oficinas-2/crossliseu/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/utfpr-oficinas-2/crossliseu/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="License: GPL-3.0" src="https://img.shields.io/badge/license-GPL--3.0-blue">
  <img alt="API: NestJS" src="https://img.shields.io/badge/api-NestJS-E0234E">
  <img alt="Web: Vue 3" src="https://img.shields.io/badge/web-Vue%203-42b883">
</p>

Crossliseu lets the public follow championships and fights, organizers manage them, an operator run each fight, and three referees score from their phones.

**Live:** <https://ediasv.dev/crossliseu/>

## Status

| Area | State |
| --- | --- |
| Homepage, sign-in (JWT) | Available |
| Championships and matches API, Swagger docs | Available |
| Organizer screens (championships, participants, matches) | Available, backed by the API |
| Arenas (create, rename, new token, delete, `config.h` download) | Available at Arenas in the top bar (`/arenas`), backed by the API |
| Operator, referee and match detail screens | Built to the Figma specs, but the API has no operator or referee endpoints yet, so they show errors |
| Computer-vision worker, ESP32 firmware | Planned / experimental |

## Tech stack

- **API:** NestJS 12, TypeORM, PostgreSQL 18, Passport (JWT), Vitest
- **Web:** Vue 3, Vite, Pinia, Vue Router, TypeScript, Vitest
- **Infra:** Docker Compose, GitHub Actions → GHCR → VPS behind NGINX

## Repository layout

```
apps/api           NestJS REST API
apps/web           Vue single-page app
apps/cv-worker     Computer-vision worker (planned)
apps/firmware      ESP32 arena box firmware
deploy/nginx       Host NGINX config for production
compose.yml        Dev stack (api, web, postgres)
compose.prod.yml   Production stack
```

Each app is standalone: there is no root `package.json`, so run `npm` commands inside the app folder.

## Getting started

### Option A: Docker (recommended)

```bash
cp .env.example .env        # fill in the required values, see "Environment variables"
docker compose up --build
```

In another terminal, apply the migrations and create the admin user:

```bash
docker compose exec api npm run migration:run -- -d src/database/data-source.ts
docker compose exec api npm run seed:admin
```

| Service | URL |
| --- | --- |
| Web | <http://localhost:5173> |
| API | <http://localhost:3000> |
| Swagger | <http://localhost:3000/docs> |

Each container keeps `node_modules` in a Docker volume and reinstalls it on start when `package-lock.json` changed, so after pulling new dependencies a plain `docker compose up` is enough. If a container fails with "node_modules is not writable", the volume predates this setup; remove it once with `docker compose down && docker volume rm crossliseu_api_node_modules crossliseu_web_node_modules` (your database volume is kept).

Postgres is pinned to `postgres:18.6-trixie`. A `crossliseu_postgres_data` volume created by an older image (such as `postgres:18-bookworm`) carries an older C library collation, and `npm run test:db` fails with "collation version mismatch". Remove it with `docker compose down && docker volume rm crossliseu_postgres_data`, start again and rerun the migrations and the seed above. This deletes your local data.

Compose points the API at the `postgres` container whatever `POSTGRES_HOST` says in `.env`. It also sets `VITE_API_URL=/api` for the web container, so the web app talks to the API through the Vite proxy; see the [web guide](apps/web/README.md#configuration).

### Option B: run the apps on your machine

Requires Node 26 (the exact version is in [`.nvmrc`](.nvmrc); `nvm use` or `fnm use` picks it up) and Docker for PostgreSQL. Set `POSTGRES_HOST=localhost` in `.env`.

```bash
docker compose up -d postgres

cd apps/api
npm ci
npm run migration:run -- -d src/database/data-source.ts
npm run seed:admin
npm run start:dev           # http://localhost:3000
```

In a second terminal:

```bash
cd apps/web
npm ci
npm run dev                 # http://localhost:5173
```

> The API loads `../../.env`, so always run its commands from `apps/api`.

## Environment variables

Defined in `.env` at the repository root (copy from `.env.example`).

| Variable | Required | Used by | Notes |
| --- | --- | --- | --- |
| `POSTGRES_DB` | Yes | API, postgres | Database name |
| `POSTGRES_USER` | Yes | API, postgres | Database user |
| `POSTGRES_PASSWORD` | Yes | API, postgres | Database password |
| `POSTGRES_PORT` | Yes | API | `5432` by default |
| `POSTGRES_HOST` | Yes | API | `postgres` inside Docker Compose, `localhost` on your machine |
| `SECRET` | Yes | API | JWT signing key, for example `openssl rand -hex 32` |
| `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | For seeding | `npm run seed:admin` | Credentials of the first admin; there is no sign-up |
| `ARENA_SERVER_URL` | No | API | WebSocket address arena boxes connect to, e.g. `wss://crossliseu.example/arena`. Written into the `config.h` the Arenas page generates; empty leaves a placeholder |
| `VITE_API_URL` | Yes | Web (build time) | API base URL, `/api` in dev. The web app has no demo data: the dev server and production builds fail without it |

## Common commands

| Task | API (`apps/api`) | Web (`apps/web`) |
| --- | --- | --- |
| Dev server | `npm run start:dev` | `npm run dev` |
| Test | `npm test` | `npm run test:unit` |
| Lint | `npm run lint` | `npm run lint` |
| Type-check / build | `npm run build` | `npm run type-check` / `npm run build` |

## Deployment

Work is merged into `dev` (CI runs on every pull request into `dev` or `main`); `dev` is merged into `main` only when stable. A push to `main` runs CI, publishes the images to GHCR and deploys to the VPS over SSH (`compose.prod.yml` in `/opt/crossliseu`). Migrations run before the new containers start. The workflow needs these repository secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` and, optionally, `VPS_PORT`. The VPS also needs its own `.env` in `/opt/crossliseu`. NGINX configuration lives in [`deploy/nginx`](deploy/nginx).

The deploy does not create users. On an empty production database, create the admin once on the VPS. The production image has no `ts-node`, so `npm run seed:admin` does not work there; run the compiled seed instead. It reads `ADMIN_USERNAME` and `ADMIN_EMAIL` from the VPS `.env` and asks for the password, so the password never has to be stored in the file:

```bash
ssh -t <vps> 'cd /opt/crossliseu && read -rsp "Admin password: " P && echo && ADMIN_PASSWORD="$P" docker compose -f compose.prod.yml run --rm -e ADMIN_PASSWORD api node dist/database/seeds/create-admin.seed.js'
```

Running it again for an existing username updates that user's email and password.

## Documentation

- [API guide](apps/api/README.md)
- [Web guide](apps/web/README.md)
- [Firmware](apps/firmware/README.md)

## License

Released under the [GPL-3.0](LICENSE) license.
