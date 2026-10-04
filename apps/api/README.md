## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## API docs

With the server running, interactive docs (Swagger UI) are available at
[http://localhost:3000/docs](http://localhost:3000/docs) and the raw OpenAPI 3 spec at
[http://localhost:3000/docs/json](http://localhost:3000/docs/json).

They are generated from the controllers and DTOs, so there is nothing to update by hand.
To call protected endpoints, log in via `POST /auth/login` and paste the returned token into **Authorize**.

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Migrations

This project uses TypeORM migrations to keep the PostgreSQL database schema synchronized with the entity definitions.

### Prerequisites

Before executing migration commands:

1. Make sure PostgreSQL is running.
2. Make sure the required environment variables are available.
3. Run the commands from the API directory:

```bash
cd apps/api
```

The TypeORM CLI loads the database configuration directly from:

```text
src/database/data-source.ts
```

It does not start the NestJS application.

### Package scripts

The following scripts should be present in `package.json`:

```json
{
    "scripts": {
        "typeorm": "typeorm-ts-node-esm",
        "migration:generate": "npm run typeorm -- migration:generate",
        "migration:create": "npm run typeorm -- migration:create",
        "migration:run": "npm run typeorm -- migration:run",
        "migration:revert": "npm run typeorm -- migration:revert"
    }
}
```

Because the project uses ECMAScript modules, migrations are executed through `typeorm-ts-node-esm`.

### Generate a migration

Use `migration:generate` after creating or modifying entity classes:

```bash
npm run migration:generate -- \
  src/database/migrations/MigrationName \
  -d src/database/data-source.ts
```

For example:

```bash
npm run migration:generate -- \
  src/database/migrations/CreateMatches \
  -d src/database/data-source.ts
```

TypeORM will:

1. Load the configured entity classes.
2. Connect to the database.
3. Compare the entities with the current database schema.
4. Generate a migration containing the necessary SQL operations.

Always inspect the generated migration before running it. TypeORM may occasionally interpret a rename as deleting the old column and creating a new one, which could cause data loss.

If TypeORM reports that no schema changes were found, verify that:

- The entity is included in the `DataSource` configuration.
- The database contains the schema produced by the previous migrations.
- The entity actually differs from the current database schema.
- `synchronize` is disabled.

### Create an empty migration

Use `migration:create` when a migration must be written manually:

```bash
npm run migration:create -- \
  src/database/migrations/MigrationName
```

For example:

```bash
npm run migration:create -- \
  src/database/migrations/AddDefaultAdmin
```

Unlike `migration:generate`, this command does not compare entities with the database. It only creates an empty migration containing `up()` and `down()` methods.

### Run pending migrations

To execute all migrations that have not yet been applied:

```bash
npm run migration:run -- \
  -d src/database/data-source.ts
```

TypeORM executes the `up()` method of each pending migration and records the executed migrations in its migrations table.

### Revert the latest migration

To revert the most recently executed migration:

```bash
npm run migration:revert -- \
  -d src/database/data-source.ts
```

TypeORM executes the migration's `down()` method.

This command reverts only one migration at a time. Run it again to revert another migration.

### Recommended workflow

When changing the database schema:

1. Modify or create the entity classes.
2. Make sure the database is running.
3. Generate a migration.
4. Review the generated `up()` and `down()` methods.
5. Run the migration.
6. Commit the entity and migration files together.

```bash
npm run migration:generate -- \
  src/database/migrations/DescribeTheChange \
  -d src/database/data-source.ts

npm run migration:run -- \
  -d src/database/data-source.ts
```

Do not enable TypeORM's automatic schema synchronization when using migrations:

```ts
synchronize: false;
```

Migrations should be the only mechanism used to apply schema changes to shared and production databases.

## Seeding the admin account

There is no public user signup. The only way to create a user is the admin seed script, which reads credentials from environment variables and stores the password as a bcrypt hash.

### Prerequisites

1. Make sure PostgreSQL is running and migrations have been applied (see [Run pending migrations](#run-pending-migrations)).
2. Set the following variables in the root `.env` file:

```text
ADMIN_USERNAME=
ADMIN_EMAIL=
ADMIN_PASSWORD=
```

3. Run the command from the API directory:

```bash
cd apps/api
```

### Run the seed script

```bash
npm run seed:admin
```

This hashes `ADMIN_PASSWORD` with bcrypt and creates the admin user if it doesn't exist yet, or updates its email and password if it does. The script is safe to run more than once.

If PostgreSQL is reachable at a different host than the one configured in `.env` (for example, running the script on the host machine against a `docker compose` database, where `POSTGRES_HOST` is set to the in-network service name `postgres`), override it inline:

```bash
POSTGRES_HOST=localhost npm run seed:admin
```
