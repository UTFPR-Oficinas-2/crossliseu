import 'reflect-metadata';
import { DataSource } from 'typeorm';
import '../src/config/env.js';
import { databaseOptions } from '../src/database/database.options.js';
import { migrationClasses } from './migrations.js';

/** Recreates POSTGRES_TEST_DB from scratch and runs every migration on it */
export default async function setup() {
    const testDb = process.env.POSTGRES_TEST_DB;
    if (!testDb || testDb === process.env.POSTGRES_DB) {
        throw new Error(
            'POSTGRES_TEST_DB must be set and differ from POSTGRES_DB',
        );
    }

    const admin = new DataSource({
        ...databaseOptions(),
        database: 'postgres',
    });
    await admin.initialize();
    try {
        await admin.query(`DROP DATABASE IF EXISTS "${testDb}" WITH (FORCE)`);
        await admin.query(`CREATE DATABASE "${testDb}"`);
    } finally {
        await admin.destroy();
    }

    const dataSource = new DataSource({
        ...databaseOptions(),
        database: testDb,
        migrations: migrationClasses,
    });
    await dataSource.initialize();
    try {
        await dataSource.runMigrations();
    } finally {
        await dataSource.destroy();
    }
}
