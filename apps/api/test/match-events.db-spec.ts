import type { INestApplication } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import {
    createTestApp,
    dataSourceOf,
    resetDatabase,
    seedChampionship,
    seedMatch,
    seedRobot,
} from './helpers.js';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

describe('match_events (db)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let matchId: string;
    let robotId: string;

    beforeAll(async () => {
        app = await createTestApp();
        ds = dataSourceOf(app);
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await resetDatabase(ds);
        const championship = await seedChampionship(ds);
        const robotA = await seedRobot(ds, championship.id, { name: 'A' });
        const robotB = await seedRobot(ds, championship.id, { name: 'B' });
        matchId = (await seedMatch(ds, championship.id, robotA.id, robotB.id))
            .id;
        robotId = robotA.id;
    });

    function insert(
        type: string,
        fields: {
            robotId?: string | null;
            judgeSeat?: number | null;
            action?: number | null;
        } = {},
    ): Promise<unknown> {
        return ds.query(
            `INSERT INTO "match_events" ("match_id", "type", "occurred_at", "robot_id", "judge_seat", "action")
             VALUES ($1, $2, now(), $3, $4, $5)`,
            [
                matchId,
                type,
                fields.robotId ?? null,
                fields.judgeSeat ?? null,
                fields.action ?? null,
            ],
        );
    }

    it('accepts a started event with no score fields', async () => {
        await insert('started');

        const rows: unknown[] = await ds.query(`SELECT 1 FROM "match_events"`);
        expect(rows).toHaveLength(1);
    });

    it('rejects a scored event without robot_id, judge_seat or action', async () => {
        const full = { robotId, judgeSeat: 1, action: 1 };

        await insert('scored', full);
        for (const missing of ['robotId', 'judgeSeat', 'action'] as const) {
            await expect(
                insert('scored', { ...full, [missing]: null }),
            ).rejects.toMatchObject({ code: CHECK_VIOLATION });
        }
    });

    it('rejects score fields on a non-scored event', async () => {
        await expect(insert('paused', { robotId })).rejects.toMatchObject({
            code: CHECK_VIOLATION,
        });
        await expect(insert('paused', { judgeSeat: 1 })).rejects.toMatchObject({
            code: CHECK_VIOLATION,
        });
        await expect(insert('paused', { action: 1 })).rejects.toMatchObject({
            code: CHECK_VIOLATION,
        });
    });

    it('rejects judge_seat 4 and action 2', async () => {
        await expect(
            insert('scored', { robotId, judgeSeat: 4, action: 1 }),
        ).rejects.toMatchObject({
            code: CHECK_VIOLATION,
            constraint: 'CHK_match_events_judge_seat',
        });
        await expect(
            insert('scored', { robotId, judgeSeat: 1, action: 2 }),
        ).rejects.toMatchObject({
            code: CHECK_VIOLATION,
            constraint: 'CHK_match_events_action',
        });
    });

    it.each(['started', 'finished', 'closed'])(
        'rejects a second %s event for the same match',
        async (type) => {
            await insert(type);

            await expect(insert(type)).rejects.toMatchObject({
                code: UNIQUE_VIOLATION,
                constraint: 'UQ_match_events_once',
            });
        },
    );

    it('allows several paused and resumed events for the same match', async () => {
        for (const type of ['paused', 'resumed', 'paused', 'resumed']) {
            await insert(type);
        }

        const rows: unknown[] = await ds.query(`SELECT 1 FROM "match_events"`);
        expect(rows).toHaveLength(4);
    });
});
