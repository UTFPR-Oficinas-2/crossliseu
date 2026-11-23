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

describe('match_referees (db)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let matchId: string;
    let otherMatchId: string;

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
        otherMatchId = (
            await seedMatch(ds, championship.id, robotA.id, robotB.id)
        ).id;
    });

    function seat(match: string, name: string, number: number) {
        return ds.query(
            `INSERT INTO "match_referees" ("match_id", "name", "name_key", "seat") VALUES ($1, $2::varchar, lower($2::varchar), $3)`,
            [match, name, number],
        );
    }

    it('rejects seat 4', async () => {
        await expect(seat(matchId, 'Ana', 4)).rejects.toMatchObject({
            code: CHECK_VIOLATION,
            constraint: 'CHK_match_referees_seat',
        });
    });

    it('rejects a second referee in the same seat', async () => {
        await seat(matchId, 'Ana', 1);

        await expect(seat(matchId, 'Bia', 1)).rejects.toMatchObject({
            code: UNIQUE_VIOLATION,
        });
    });

    it('rejects the same name_key twice for one match', async () => {
        await seat(matchId, 'Ana', 1);

        await expect(seat(matchId, 'ANA', 2)).rejects.toMatchObject({
            code: UNIQUE_VIOLATION,
            constraint: 'UQ_match_referees_match_id_name_key',
        });
    });

    it('allows the same name on two matches', async () => {
        await seat(matchId, 'Ana', 1);
        await seat(otherMatchId, 'Ana', 1);

        const rows: unknown[] = await ds.query(
            `SELECT 1 FROM "match_referees"`,
        );
        expect(rows).toHaveLength(2);
    });

    it('stamps joined_at', async () => {
        await seat(matchId, 'Ana', 1);

        const [row] = await ds.query<{ joined_at: Date | null }[]>(
            `SELECT "joined_at" FROM "match_referees"`,
        );
        expect(row?.joined_at).toBeInstanceOf(Date);
    });

    it('rejects two matches with the same referee token', async () => {
        await ds.query(
            `UPDATE "matches" SET "referee_token" = 'tok' WHERE "id" = $1`,
            [matchId],
        );

        await expect(
            ds.query(
                `UPDATE "matches" SET "referee_token" = 'tok' WHERE "id" = $1`,
                [otherMatchId],
            ),
        ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    });
});
