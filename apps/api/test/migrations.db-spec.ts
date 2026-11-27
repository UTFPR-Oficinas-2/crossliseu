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

        type Owner = {
            user: string;
            championship: string;
            a: string;
            b: string;
        };

        async function seedOwner(): Promise<Owner> {
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
            return {
                user: user!.id,
                championship: championship!.id,
                a: robots[0]!.id,
                b: robots[1]!.id,
            };
        }

        /** A time-out with the given points per side (one seat each), with no winner, as before #50 */
        async function insertTimeOut(
            owner: Owner,
            points: { A: number; B: number },
            closed: boolean,
        ): Promise<string> {
            const [row]: { id: string }[] = await ds.query(
                `INSERT INTO "matches" ("weight_class", "state", "end_reason", "championship_id",
                    "robot_a_id", "robot_b_id", "created_by_user_id")
                 VALUES ('antweight', 'finished', 'time_out', $1, $2, $3, $4) RETURNING "id"`,
                [owner.championship, owner.a, owner.b, owner.user],
            );
            const id = row!.id;
            const scores = [
                ...Array.from({ length: points.A }, () => owner.a),
                ...Array.from({ length: points.B }, () => owner.b),
            ];
            for (const robotId of scores) {
                await ds.query(
                    `INSERT INTO "match_events" ("match_id", "type", "occurred_at", "robot_id", "judge_seat", "action")
                     VALUES ($1, 'scored', now(), $2, 1, 1)`,
                    [id, robotId],
                );
            }
            // A referee's +1 then -1 for A must not count
            await ds.query(
                `INSERT INTO "match_events" ("match_id", "type", "occurred_at", "robot_id", "judge_seat", "action")
                 VALUES ($1, 'scored', now(), $2, 2, 1), ($1, 'scored', now(), $2, 2, -1)`,
                [id, owner.a],
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

        async function resultOf(id: string) {
            const [row]: ResultRow[] = await ds.query(
                `SELECT "id", "winner_robot_id", "surrendered_robot_id", "draw" FROM "matches" WHERE "id" = $1`,
                [id],
            );
            return row;
        }

        it('gives fights closed before #50 without a winner their result from the points', async () => {
            const owner = await seedOwner();
            const aAhead = await insertTimeOut(owner, { A: 2, B: 1 }, true);
            const bAhead = await insertTimeOut(owner, { A: 0, B: 3 }, true);
            const tied = await insertTimeOut(owner, { A: 1, B: 1 }, true);
            const scoreless = await insertTimeOut(owner, { A: 0, B: 0 }, true);
            const open = await insertTimeOut(owner, { A: 2, B: 0 }, false);

            await ds.runMigrations();

            expect(await resultOf(aAhead)).toMatchObject({
                winner_robot_id: owner.a,
                draw: false,
            });
            expect(await resultOf(bAhead)).toMatchObject({
                winner_robot_id: owner.b,
                draw: false,
            });
            expect(await resultOf(tied)).toMatchObject({
                winner_robot_id: null,
                draw: true,
            });
            expect(await resultOf(scoreless)).toMatchObject({
                winner_robot_id: null,
                draw: true,
            });
            // Not closed yet: the operator confirms it
            expect(await resultOf(open)).toMatchObject({
                winner_robot_id: null,
                draw: false,
            });
        });

        it('a rollback keeps a surrender closed as a draw without a winner', async () => {
            const owner = await seedOwner();
            await ds.runMigrations();
            const [row]: { id: string }[] = await ds.query(
                `INSERT INTO "matches" ("weight_class", "state", "end_reason", "championship_id",
                    "robot_a_id", "robot_b_id", "created_by_user_id", "surrendered_robot_id", "draw")
                 VALUES ('antweight', 'finished', 'surrender', $1, $2, $3, $4, $2, true) RETURNING "id"`,
                [owner.championship, owner.a, owner.b, owner.user],
            );
            await ds.query(
                `INSERT INTO "match_events" ("match_id", "type", "occurred_at")
                 VALUES ($1, 'closed', now())`,
                [row!.id],
            );

            await undoThrough(MIGRATION);

            const [after]: { winner_robot_id: string | null }[] =
                await ds.query(
                    `SELECT "winner_robot_id" FROM "matches" WHERE "id" = $1`,
                    [row!.id],
                );
            expect(after?.winner_robot_id).toBeNull();
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

    describe('MatchVideoAnalysisUpdatedAt', () => {
        const MIGRATION = 'MatchVideoAnalysisUpdatedAt1794800000000';
        const TABLES = `"users", "championships", "robots", "matches", "match_videos"`;

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

        /** A match with one uploaded video in `analysisStatus`, uploaded at `uploadedAt` */
        async function insertVideo(
            analysisStatus: string | null,
            uploadedAt: string,
        ): Promise<string> {
            const [user]: { id: string }[] = await ds.query(
                `INSERT INTO "users" ("username", "email", "password")
                 VALUES ('op-' || gen_random_uuid(), gen_random_uuid() || '@example.com', 'pw') RETURNING "id"`,
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
            const [match]: { id: string }[] = await ds.query(
                `INSERT INTO "matches" ("weight_class", "state", "championship_id",
                    "robot_a_id", "robot_b_id", "created_by_user_id")
                 VALUES ('antweight', 'finished', $1, $2, $3, $4) RETURNING "id"`,
                [championship!.id, robots[0]!.id, robots[1]!.id, user!.id],
            );
            const [video]: { id: string }[] = await ds.query(
                `INSERT INTO "match_videos" ("match_id", "object_key", "content_type", "status",
                    "uploaded_at", "uploaded_by_user_id", "analysis_status")
                 VALUES ($1, 'recordings/x.mp4', 'video/mp4', 'uploaded', $2, $3, $4) RETURNING "id"`,
                [match!.id, uploadedAt, user!.id, analysisStatus],
            );
            return video!.id;
        }

        async function updatedAtOf(id: string): Promise<Date | null> {
            const [row]: { analysis_updated_at: Date | null }[] =
                await ds.query(
                    `SELECT "analysis_updated_at" FROM "match_videos" WHERE "id" = $1`,
                    [id],
                );
            return row!.analysis_updated_at;
        }

        beforeEach(async () => {
            await ds.runMigrations();
            await ds.query(`TRUNCATE ${TABLES} CASCADE`);
            await undoThrough(MIGRATION);
        });

        afterEach(async () => {
            await ds.query(`TRUNCATE ${TABLES} CASCADE`);
            await ds.runMigrations();
        });

        it('starts the clock of live analyses at the deploy and of finished ones at their upload', async () => {
            const uploadedAt = '2026-11-01T10:00:00.000Z';
            const before = Date.now();
            const running = await insertVideo('running', uploadedAt);
            const pending = await insertVideo('pending', uploadedAt);
            const done = await insertVideo('done', uploadedAt);
            const failed = await insertVideo('failed', uploadedAt);
            const none = await insertVideo(null, uploadedAt);

            await ds.runMigrations();

            for (const id of [running, pending]) {
                expect(
                    (await updatedAtOf(id))!.getTime(),
                ).toBeGreaterThanOrEqual(before - 1000);
            }
            expect(await updatedAtOf(done)).toEqual(new Date(uploadedAt));
            expect(await updatedAtOf(failed)).toEqual(new Date(uploadedAt));
            expect(await updatedAtOf(none)).toBeNull();
        });

        it('rolls back to no analysis_updated_at column', async () => {
            await ds.runMigrations();
            await undoThrough(MIGRATION);

            const rows: { column_name: string }[] = await ds.query(
                `SELECT column_name FROM information_schema.columns
                 WHERE table_name = 'match_videos' AND column_name = 'analysis_updated_at'`,
            );
            expect(rows).toEqual([]);
        });
    });
});
