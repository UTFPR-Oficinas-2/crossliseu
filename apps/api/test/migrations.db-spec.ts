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
            'arenas',
            'championships',
            'match_events',
            'match_referees',
            'match_videos',
            'matches',
            'migrations',
            'robots',
            'users',
        ]);
    });

    it('creates arenas with its unique constraints and the current match FK', async () => {
        const columns: { column_name: string; is_nullable: string }[] =
            await ds.query(
                `SELECT column_name, is_nullable FROM information_schema.columns
                 WHERE table_name = 'arenas' ORDER BY column_name`,
            );
        expect(columns).toEqual([
            { column_name: 'created_at', is_nullable: 'NO' },
            { column_name: 'current_match_id', is_nullable: 'YES' },
            { column_name: 'deleted_at', is_nullable: 'YES' },
            { column_name: 'device_id', is_nullable: 'NO' },
            { column_name: 'id', is_nullable: 'NO' },
            { column_name: 'modified_at', is_nullable: 'NO' },
            { column_name: 'name', is_nullable: 'NO' },
            { column_name: 'owner_user_id', is_nullable: 'NO' },
            { column_name: 'token_hash', is_nullable: 'NO' },
        ]);

        const uniques: { conname: string }[] = await ds.query(
            `SELECT conname FROM pg_constraint
             WHERE conrelid = 'arenas'::regclass AND contype = 'u' ORDER BY 1`,
        );
        expect(uniques.map((row) => row.conname)).toEqual([
            'UQ_arenas_current_match_id',
            'UQ_arenas_device_id',
        ]);

        const [ownerNameIndex]: { indexdef: string }[] = await ds.query(
            `SELECT indexdef FROM pg_indexes
             WHERE indexname = 'UQ_arenas_owner_user_id_lower_name'`,
        );
        expect(ownerNameIndex?.indexdef).toContain('lower(');
        expect(ownerNameIndex?.indexdef).toContain(
            'WHERE (deleted_at IS NULL)',
        );
    });

    it('links arenas and matches both ways with nullable FKs', async () => {
        const fks: { source: string; target: string }[] = await ds.query(
            `SELECT conrelid::regclass::text || '.' || a.attname AS source,
                    confrelid::regclass::text AS target
             FROM pg_constraint c
             JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
             WHERE c.contype = 'f' AND a.attname IN ('arena_id', 'current_match_id')
             ORDER BY 1`,
        );
        expect(fks).toEqual([
            { source: 'arenas.current_match_id', target: 'matches' },
            { source: 'matches.arena_id', target: 'arenas' },
        ]);

        const [arenaId]: { is_nullable: string }[] = await ds.query(
            `SELECT is_nullable FROM information_schema.columns
             WHERE table_name = 'matches' AND column_name = 'arena_id'`,
        );
        expect(arenaId?.is_nullable).toBe('YES');
    });

    describe('ArenaOwners', () => {
        async function insertUser(
            username: string,
            createdAt: string,
            deletedAt: string | null,
        ): Promise<string> {
            const [row]: { id: string }[] = await ds.query(
                `INSERT INTO "users" ("username", "email", "password", "created_at", "deleted_at")
                 VALUES ($1, $2, 'pw', $3, $4) RETURNING "id"`,
                [username, `${username}@example.com`, createdAt, deletedAt],
            );
            return row!.id;
        }

        async function insertArena(name: string): Promise<void> {
            await ds.query(
                `INSERT INTO "arenas" ("name", "device_id", "token_hash")
                 VALUES ($1, $2, 'hash')`,
                [name, `${name}-device`],
            );
        }

        async function cleanUp(): Promise<void> {
            // Empty first: the migration refuses arenas without a live user
            await ds.query(`TRUNCATE "users", "arenas" CASCADE`);
            await ds.runMigrations();
        }

        beforeEach(async () => {
            await ds.runMigrations();
            await ds.query(`TRUNCATE "users", "arenas" CASCADE`);
            // Undo every migration down to ArenaOwners, so it is the next to run however many
            // newer ones exist
            while (
                (
                    await ds.query(
                        `SELECT 1 FROM "migrations" WHERE "name" = 'ArenaOwners1794100000000'`,
                    )
                ).length > 0
            ) {
                await ds.undoLastMigration();
            }
        });

        afterEach(cleanUp);

        it('gives existing arenas to the oldest live user', async () => {
            await insertUser('ghost', '2026-01-01', '2026-02-01');
            const adminId = await insertUser('admin', '2026-01-02', null);
            await insertUser('newer', '2026-01-03', null);
            await insertArena('Arena 1');
            await insertArena('Arena 2');

            await ds.runMigrations();

            const owners: { owner_user_id: string }[] = await ds.query(
                `SELECT "owner_user_id" FROM "arenas"`,
            );
            expect(owners).toEqual([
                { owner_user_id: adminId },
                { owner_user_id: adminId },
            ]);
        });

        it('refuses to run when arenas exist but no live user can own them', async () => {
            await insertArena('Arena 1');

            await expect(ds.runMigrations()).rejects.toThrow('no live user');
        });
    });

    describe('MatchResult', () => {
        const MIGRATION = 'MatchResult1794700000000';

        interface ResultRow {
            id: string;
            winner_robot_id: string | null;
            surrendered_robot_id: string | null;
            draw: boolean;
        }

        async function undoThrough(name: string): Promise<void> {
            while (
                (
                    await ds.query(
                        `SELECT 1 FROM "migrations" WHERE "name" = $1`,
                        [name],
                    )
                ).length > 0
            ) {
                await ds.undoLastMigration();
            }
        }

        async function columnsOfMatches(): Promise<string[]> {
            const rows: { column_name: string }[] = await ds.query(
                `SELECT column_name FROM information_schema.columns
                 WHERE table_name = 'matches' ORDER BY column_name`,
            );
            return rows.map((row) => row.column_name);
        }

        /** A surrender match between A and B that B won; `closed` adds a `closed` event */
        async function insertSurrender(
            owner: { user: string; championship: string; a: string; b: string },
            closed: boolean,
        ): Promise<string> {
            const [row]: { id: string }[] = await ds.query(
                `INSERT INTO "matches" ("weight_class", "state", "end_reason", "championship_id",
                    "robot_a_id", "robot_b_id", "winner_robot_id", "created_by_user_id")
                 VALUES ('antweight', 'finished', 'surrender', $1, $2, $3, $3, $4) RETURNING "id"`,
                [owner.championship, owner.a, owner.b, owner.user],
            );
            const id = row!.id;
            await ds.query(
                `INSERT INTO "match_events" ("match_id", "type", "occurred_at")
                 VALUES ($1, 'finished', now())`,
                [id],
            );
            if (closed) {
                await ds.query(
                    `INSERT INTO "match_events" ("match_id", "type", "occurred_at")
                     VALUES ($1, 'closed', now() + interval '1 second')`,
                    [id],
                );
            }
            return id;
        }

        beforeEach(async () => {
            await ds.runMigrations();
            await ds.query(
                `TRUNCATE "users", "championships", "robots", "matches", "match_events" CASCADE`,
            );
            await undoThrough(MIGRATION);
        });

        afterEach(async () => {
            await ds.query(
                `TRUNCATE "users", "championships", "robots", "matches", "match_events" CASCADE`,
            );
            await ds.runMigrations();
        });

        it('records who surrendered and keeps the winner only on closed fights', async () => {
            const [user]: { id: string }[] = await ds.query(
                `INSERT INTO "users" ("username", "email", "password")
                 VALUES ('op', 'op@example.com', 'pw') RETURNING "id"`,
            );
            const [championship]: { id: string }[] = await ds.query(
                `INSERT INTO "championships" ("name", "start_date", "end_date", "created_by_user_id")
                 VALUES ('Cup', now(), now(), $1) RETURNING "id"`,
                [user!.id],
            );
            const robots: { id: string }[] = await ds.query(
                `INSERT INTO "robots" ("name", "weight_class", "team", "championship_id", "created_by_user_id")
                 VALUES ('A', 'antweight', 'T', $1, $2), ('B', 'antweight', 'T', $1, $2)
                 RETURNING "id"`,
                [championship!.id, user!.id],
            );
            const owner = {
                user: user!.id,
                championship: championship!.id,
                a: robots[0]!.id,
                b: robots[1]!.id,
            };
            const open = await insertSurrender(owner, false);
            const closed = await insertSurrender(owner, true);

            await ds.runMigrations();

            const rows: ResultRow[] = await ds.query(
                `SELECT "id", "winner_robot_id", "surrendered_robot_id", "draw" FROM "matches"`,
            );
            expect(rows.find((row) => row.id === open)).toEqual({
                id: open,
                winner_robot_id: null,
                surrendered_robot_id: owner.a,
                draw: false,
            });
            expect(rows.find((row) => row.id === closed)).toEqual({
                id: closed,
                winner_robot_id: owner.b,
                surrendered_robot_id: owner.a,
                draw: false,
            });
        });

        it('refuses a match with both a winner and a draw', async () => {
            await ds.runMigrations();
            const [check]: { def: string }[] = await ds.query(
                `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
                 WHERE conname = 'CHK_matches_result'`,
            );
            expect(check?.def).toContain('draw');
            expect(check?.def).toContain('winner_robot_id');
        });

        it('rolls back to no result columns', async () => {
            await ds.runMigrations();
            await undoThrough(MIGRATION);

            const columns = await columnsOfMatches();
            expect(columns).not.toContain('draw');
            expect(columns).not.toContain('surrendered_robot_id');
        });
    });
});
