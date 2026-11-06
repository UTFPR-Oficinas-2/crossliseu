import 'reflect-metadata';
import { readdirSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../src/database/database.options.js';
import { migrationClasses } from './migrations.js';

describe('migrations on a fresh database', () => {
    let ds: DataSource;

    beforeAll(async () => {
        ds = new DataSource({
            ...databaseOptions(),
            migrations: migrationClasses,
        });
        await ds.initialize();
    });

    afterAll(async () => {
        await ds.destroy();
    });

    async function tables(): Promise<string[]> {
        const rows: { tablename: string }[] = await ds.query(
            `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`,
        );
        return rows.map((row) => row.tablename);
    }

    it('reverts every migration and runs them all again', async () => {
        const files = readdirSync('src/database/migrations').filter((file) =>
            file.endsWith('.ts'),
        );
        expect(migrationClasses).toHaveLength(files.length);

        while (
            (await ds.query(`SELECT 1 FROM "migrations" LIMIT 1`)).length > 0
        ) {
            await ds.undoLastMigration();
        }
        expect(await tables()).toEqual(['migrations']);

        const applied = await ds.runMigrations();

        expect(applied).toHaveLength(files.length);
        expect(await tables()).toEqual([
            'championships',
            'match_pauses',
            'match_score_events',
            'matches',
            'migrations',
            'robots',
            'users',
        ]);
    });
});
