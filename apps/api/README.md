# Crossliseu API

NestJS REST API for championships, matches and authentication. Part of the [Crossliseu](../../README.md) monorepo.

## Requirements

- Node 26 (exact version in [`.nvmrc`](../../.nvmrc))
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

## Configuration

Database and `SECRET` come from the root `.env`. The API also reads:

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | | `production` disables Swagger |
| `ARENA_SERVER_URL` | | WebSocket address arena boxes connect to, e.g. `wss://crossliseu.example/arena`. Returned as `serverUrl` with new device credentials; `null` when unset |
| `POSTGRES_TEST_DB` | | Database `npm run test:db` drops and recreates; must differ from `POSTGRES_DB` |

## Authentication

Every route requires a JWT unless marked public. There is no sign-up; the first user comes from the [admin seed](#seeding-the-admin).

```bash
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username": "<ADMIN_USERNAME>", "password": "<ADMIN_PASSWORD>"}'
```

Send the returned token as `Authorization: Bearer <token>`. Tokens expire after 2 hours.

Public routes: `POST /auth/login`, `GET /championships`, `GET /championships/:id`, `GET /robots`, `GET /robots/:id`, `GET /matches`, `GET /matches/:id`. Every other route needs a token.

`GET /championships/mine` is protected. It lists the caller's live championships, with the same counts as `GET /championships`.

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

## Arenas

An arena is a physical box. It belongs to the account that created it; every route needs a token and is owner-scoped, so another account's arena, or a deleted one, answers 404 `arena_not_found`.

| Route | Description |
| --- | --- |
| `GET /arenas` | The caller's arenas as `{ id, name, deviceId, online, currentMatchId, currentMatch }`. `currentMatch` is `{ id, robotAName, robotBName }` or `null`; `online` is always `false` until arena devices connect |
| `POST /arenas` | Body `{ "name": "..." }` (1-40 characters). 201 `{ arena, credentials }`, where `credentials` is `{ deviceId, token, serverUrl }`. The token is shown only this once. 400 for an invalid name, 409 `arena_name_taken` |
| `PATCH /arenas/:id` | Body `{ "name": "..." }`. Renames the arena; the `deviceId` never changes. 404, 409 `arena_name_taken` |
| `POST /arenas/:id/token` | Generates a new token and returns the credentials; the old token stops working. 404, 409 `arena_match_live` |
| `DELETE /arenas/:id` | 204. Soft-deletes the arena, clears its current match and frees the name. 404, 409 `arena_match_live` |
| `PUT /arenas/:id/current-match` | Body `{ "matchId": "<uuid>" }`. Select (or swap to) the scheduled match the arena runs next. 404 `arena_not_found` / `match_not_found` (also for another account's match), 409 `match_not_scheduled`, `match_already_current` or `arena_match_started` |
| `DELETE /arenas/:id/current-match` | Leaves the arena without a current match: closes a finished match or undoes a pick before Start. 200 with the arena. Succeeds without a current match. 404 `arena_not_found`, 409 `arena_match_live` |

Names are unique per account among live arenas, ignoring case. The `deviceId` is generated from the name plus 4 hex characters. `arena_match_live` means the arena's current match is `ongoing` or `paused`. Only a bcrypt hash of the token is stored. Selecting the arena's current match again succeeds and changes nothing. Deleting a match clears it from its arena. A finished current match stays on the arena until it is cleared; select the next match after clearing.
