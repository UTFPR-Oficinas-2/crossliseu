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
| `npm run migration:generate` / `migration:run` / `migration:revert` | Manage migrations, see [Migrations](#migrations) |
| `npm run seed:admin` | Create the admin user, see [Seeding the admin](#seeding-the-admin) |

## Configuration

Database and `SECRET` come from the root `.env`. The API also reads:

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | | `production` disables Swagger |

## Authentication

Every route requires a JWT unless marked public. There is no sign-up; the first user comes from the [admin seed](#seeding-the-admin).

```bash
curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username": "<ADMIN_USERNAME>", "password": "<ADMIN_PASSWORD>"}'
```

Send the returned token as `Authorization: Bearer <token>`. Tokens expire after 2 hours.

Public routes: `POST /auth/login`, `GET /championships`, `GET /championships/:id`, `GET /matches`, `GET /matches/:id`.

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
