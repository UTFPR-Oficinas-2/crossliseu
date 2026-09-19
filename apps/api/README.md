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
