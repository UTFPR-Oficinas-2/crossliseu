# Crossliseu API

NestJS REST API for championships, matches and authentication. Part of the [Crossliseu](../../README.md) monorepo.

## Requirements

- Node 22.18+ (or 24.12+)
- PostgreSQL 18, started with `docker compose up -d postgres` from the repository root
- A root `.env` file; see [Environment variables](../../README.md#environment-variables)

## Getting started

Run every command from `apps/api`: the API loads the root `.env` through the relative path `../../.env`. Set `POSTGRES_HOST=localhost` when running outside Docker.

```bash
npm ci
npm run migration:run -- -d src/database/data-source.ts
npm run seed:admin
npm run start:dev          # http://localhost:3000
```

## Scripts

| Script | Description |
| --- | --- |
| `npm run start:dev` | Start with file watching |
| `npm run start:prod` | Run the compiled app (`npm run build` first) |
| `npm run build` | Compile to `dist/` |
| `npm run lint` | Lint with oxlint (type-aware) |
| `npm run format` | Format with Prettier |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:cov` | Run unit tests with coverage |
| `npm run test:db` | Run the database and e2e tests in `test/` against `POSTGRES_TEST_DB` (dropped and recreated on each run; needs Postgres up) |
| `npm run migration:generate` / `migration:run` / `migration:revert` | Manage migrations, see [Migrations](#migrations) |
| `npm run seed:admin` | Create the admin user, see [Seeding the admin](#seeding-the-admin) |
| `npm run seed:arena` | Create an arena or rotate its device token, see [Seeding an arena](#seeding-an-arena) |

## Configuration

Database and `SECRET` come from the root `.env`. The API also reads:

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | | `production` disables Swagger |
| `POSTGRES_TEST_DB` | | Database `npm run test:db` drops and recreates; must differ from `POSTGRES_DB` |

## Authentication

Every route requires a JWT unless marked public. There is no sign-up; the first user comes from the [admin seed](#seeding-the-admin).

```bash
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username": "<ADMIN_USERNAME>", "password": "<ADMIN_PASSWORD>"}'
```

Send the returned token as `Authorization: Bearer <token>`. Tokens expire after 2 hours.

Public routes: `POST /auth/login`, `GET /championships`, `GET /championships/:id`, `GET /matches`, `GET /matches/:id`. `GET /championships/mine` is protected and lists only the caller's championships.

Each account is an organization. Management is per account: a write to a championship, or to its robots or matches, that belongs to another account answers 404 with the same message as an unknown id. Public reads are not per account.

## API docs

Swagger UI is served at <http://localhost:3000/docs> and the OpenAPI JSON at <http://localhost:3000/docs/json>. Both return 404 when `NODE_ENV=production`. To try protected endpoints, log in, then paste the token into **Authorize**.

## Migrations

Schema changes go through TypeORM migrations (`synchronize` is always `false`). The `-d` flag is required on every command.

```bash
# After changing an entity: generate a migration, then review the SQL before running it
npm run migration:generate -- src/database/migrations/MigrationName -d src/database/data-source.ts

# Apply pending migrations
npm run migration:run -- -d src/database/data-source.ts

# Undo the last migration
npm run migration:revert -- -d src/database/data-source.ts
```

TypeORM can read a column rename as drop + create, which loses data. Check the generated file first.

## Seeding the admin

Set `ADMIN_USERNAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the root `.env`, then:

```bash
npm run seed:admin
```

Inside Docker Compose use `docker compose exec api npm run seed:admin` instead.

## Seeding an arena

Each physical arena box needs a row in `arenas` and a device token. Pass the arena's name and the `deviceId` flashed on the box:

```bash
ARENA_NAME="Arena 1" ARENA_DEVICE_ID=arena-1 npm run seed:arena
```

It prints `Created arena "Arena 1"` and `Device token (shown once): <64 hex chars>`. Only a bcrypt hash is stored, so copy the token into the box's firmware config now; it can't be read back.

Running it again with the same `ARENA_DEVICE_ID` updates the name and **rotates the token**: the old token stops working and a new one is printed. Use that when a token leaks or is lost.

Inside Docker Compose use `docker compose exec -e ARENA_NAME="Arena 1" -e ARENA_DEVICE_ID=arena-1 api npm run seed:arena`.

## Arenas

| Route | Description |
| --- | --- |
| `GET /arenas` | List arenas as `{ id, name, online, currentMatchId }`. `online` is always `false` until arena devices connect |
| `PUT /arenas/:id/current-match` | Body `{ "matchId": "<uuid>" }`. Select (or swap to) the scheduled match the arena runs next |

`PUT` answers 404 `arena_not_found` / `match_not_found`, or 409 with `match_not_scheduled`, `match_already_current` (current on another arena) or `arena_match_started` (the arena's current match already started). Selecting the arena's current match again succeeds and changes nothing. Deleting a match clears it from its arena.
