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
| Organizer, operator, referee and fight screens | Prototype (dev build only, mock data) |
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
firmware           ESP32 countdown timer sketch
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

Use `POSTGRES_HOST=postgres` in `.env`. In this mode the web app has no `VITE_API_URL`, so it shows demo data; see the [web guide](apps/web/README.md#configuration) to connect it to the API.

### Option B: run the apps on your machine

Requires Node 22.18+ (or 24.12+) and Docker for PostgreSQL. Set `POSTGRES_HOST=localhost` in `.env`.

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
| `VITE_API_URL` | No | Web (build time) | Without it the dev server uses demo data and production builds fail |

## Common commands

| Task | API (`apps/api`) | Web (`apps/web`) |
| --- | --- | --- |
| Dev server | `npm run start:dev` | `npm run dev` |
| Test | `npm test` | `npm run test:unit` |
| Lint | `npm run lint` | `npm run lint` |
| Type-check / build | `npm run build` | `npm run type-check` / `npm run build` |

## Deployment

A push to `main` runs CI, publishes the images to GHCR and deploys to the VPS over SSH (`compose.prod.yml` in `/opt/crossliseu`). Migrations run before the new containers start. The workflow needs these repository secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` and, optionally, `VPS_PORT`. The VPS also needs its own `.env` in `/opt/crossliseu`. NGINX configuration lives in [`deploy/nginx`](deploy/nginx).

## Documentation

- [API guide](apps/api/README.md)
- [Web guide](apps/web/README.md)
- [Firmware](firmware/README.md)

## License

Released under the [GPL-3.0](LICENSE) license.
