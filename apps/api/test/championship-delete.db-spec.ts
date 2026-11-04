import { NotFoundException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { MatchesService } from '../src/modules/matches/matches.service.js';
import { RobotsService } from '../src/modules/robots/robots.service.js';
import {
    createTestApp,
    createUser,
    dataSourceOf,
    isPendingAfter,
    loginToken,
    resetDatabase,
    seedChampionship,
    seedCreatorId,
    seedMatch,
    seedRobot,
} from './helpers.js';

describe('deleting a championship (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let token: string;

    beforeAll(async () => {
        app = await createTestApp();
        ds = dataSourceOf(app);
    });

    beforeEach(async () => {
        await resetDatabase(ds);
        await createUser(ds, 'admin', 'pw');
        token = await loginToken(app, 'admin', 'pw');
    });

    afterAll(async () => {
        await app.close();
    });

    const http = () => request(app.getHttpServer());
    const auth = () => ({ Authorization: `Bearer ${token}` });

    async function championshipWithAMatch() {
        const championship = await seedChampionship(ds);
        const a = await seedRobot(ds, championship.id, { name: 'Titã' });
        const b = await seedRobot(ds, championship.id, { name: 'Marte' });
        const match = await seedMatch(ds, championship.id, a.id, b.id);
        return { championship, match };
    }

    it('removes its robots and matches with it', async () => {
        const { championship } = await championshipWithAMatch();

        await http()
            .delete(`/championships/${championship.id}`)
            .set(auth())
            .expect(204);

        const robots = await http()
            .get(`/robots?championshipId=${championship.id}`)
            .expect(200);
        const matches = await http()
            .get(`/matches?championshipId=${championship.id}`)
            .expect(200);
        expect(robots.body).toEqual([]);
        expect(matches.body).toEqual([]);
        await http().get(`/championships/${championship.id}`).expect(404);
    });

    it('keeps the deletion time of robots and matches removed earlier', async () => {
        const { championship } = await championshipWithAMatch();
        const old = await seedRobot(ds, championship.id, { name: 'Antigo' });
        await ds.query(
            `UPDATE "robots" SET "deleted_at" = '2026-01-01T00:00:00Z' WHERE "id" = $1`,
            [old.id],
        );

        await http()
            .delete(`/championships/${championship.id}`)
            .set(auth())
            .expect(204);

        const [row] = await ds.query(
            `SELECT "deleted_at" FROM "robots" WHERE "id" = $1`,
            [old.id],
        );
        expect(row.deleted_at).toEqual(new Date('2026-01-01T00:00:00Z'));
    });

    it.each(['ongoing', 'paused'])(
        'refuses while a match is %s and deletes nothing',
        async (state) => {
            const { championship, match } = await championshipWithAMatch();
            await ds.query(
                `UPDATE "matches" SET "state" = $1 WHERE "id" = $2`,
                [state, match.id],
            );

            const response = await http()
                .delete(`/championships/${championship.id}`)
                .set(auth())
                .expect(409);

            expect(response.body.message).toBe('championship_has_live_match');
            const [counts] = await ds.query(
                `SELECT
                    (SELECT COUNT(*) FROM "championships" WHERE "deleted_at" IS NULL) AS "championships",
                    (SELECT COUNT(*) FROM "robots" WHERE "deleted_at" IS NULL) AS "robots",
                    (SELECT COUNT(*) FROM "matches" WHERE "deleted_at" IS NULL) AS "matches"`,
            );
            expect(counts).toEqual({
                championships: '1',
                robots: '2',
                matches: '1',
            });
        },
    );

    it('makes a robot insert wait for a championship delete, then refuse it', async () => {
        const championship = await seedChampionship(ds);
        const queryRunner = ds.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            await queryRunner.query(
                `SELECT 1 FROM "championships" WHERE "id" = $1 FOR UPDATE`,
                [championship.id],
            );
            await queryRunner.query(
                `UPDATE "championships" SET "deleted_at" = now() WHERE "id" = $1`,
                [championship.id],
            );

            const create = app.get(RobotsService).create(
                {
                    name: 'Titã',
                    team: 'Equipe',
                    weightClass: 'lightweight',
                    championshipId: championship.id,
                },
                await seedCreatorId(ds),
            );
            const createResult = create.catch((e: unknown) => e);

            expect(await isPendingAfter(create, 200)).toBe(true);
            await queryRunner.commitTransaction();

            expect(await createResult).toEqual(
                new NotFoundException('championship_not_found'),
            );
            const [{ count }] = await ds.query(`SELECT COUNT(*) FROM "robots"`);
            expect(count).toBe('0');
        } finally {
            if (queryRunner.isTransactionActive) {
                await queryRunner.rollbackTransaction();
            }
            await queryRunner.release();
        }
    });

    it('makes a match insert wait for a championship delete, then refuse it', async () => {
        const championship = await seedChampionship(ds);
        const a = await seedRobot(ds, championship.id, { name: 'Titã' });
        const b = await seedRobot(ds, championship.id, { name: 'Marte' });
        const queryRunner = ds.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            await queryRunner.query(
                `SELECT 1 FROM "championships" WHERE "id" = $1 FOR UPDATE`,
                [championship.id],
            );
            await queryRunner.query(
                `UPDATE "championships" SET "deleted_at" = now() WHERE "id" = $1`,
                [championship.id],
            );

            const create = app.get(MatchesService).create(
                {
                    championshipId: championship.id,
                    robotAId: a.id,
                    robotBId: b.id,
                    scheduledAt: new Date('2026-11-04T13:00:00Z'),
                },
                await seedCreatorId(ds),
            );
            const createResult = create.catch((e: unknown) => e);

            expect(await isPendingAfter(create, 200)).toBe(true);
            await queryRunner.commitTransaction();

            expect(await createResult).toEqual(
                new NotFoundException('championship_not_found'),
            );
            const [{ count }] = await ds.query(
                `SELECT COUNT(*) FROM "matches"`,
            );
            expect(count).toBe('0');
        } finally {
            if (queryRunner.isTransactionActive) {
                await queryRunner.rollbackTransaction();
            }
            await queryRunner.release();
        }
    });
});
