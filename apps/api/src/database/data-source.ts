import 'reflect-metadata';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';
import { databaseOptions } from './database.options.js';
import '../config/env.js';

// Used by the TypeORM CLI (migration:run, migration:generate, migration:revert)
export default new DataSource({
    ...databaseOptions(),
    migrations: [
        fileURLToPath(new URL('./migrations/*{.ts,.js}', import.meta.url)),
    ],
});
