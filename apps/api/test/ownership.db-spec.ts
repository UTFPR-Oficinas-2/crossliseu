import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { Robot } from '../src/modules/robots/entities/robot.entity.js';
import { Championship } from '../src/modules/championships/entities/championship.entity.js';
import {
    createTestApp,
    createUser,
    dataSourceOf,
    loginToken,
    resetDatabase,
    seedMatch,
    seedRobot,
} from './helpers.js';

describe('championship ownership (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let tokenA: string;
    let tokenB: string;
    let champA: Championship;
    let champB: Championship;

    beforeAll(async () => {
        app = await createTestApp();
        ds = dataSourceOf(app);
    });

    beforeEach(async () => {
        await resetDatabase(ds);
        const userA = await createUser(ds, 'org-a', 'pw');
        const userB = await createUser(ds, 'org-b', 'pw');
        tokenA = await loginToken(app, 'org-a', 'pw');
        tokenB = await loginToken(app, 'org-b', 'pw');
        const day = new Date('2026-11-04T12:00:00Z');
        const repo = ds.getRepository(Championship);
        champA = await repo.save(
            new Championship('Copa A', day, day, userA.id),
        );
        champB = await repo.save(
            new Championship('Copa B', day, day, userB.id),
        );
    });

    afterAll(async () => {
        await app.close();
    });

    const http = () => request(app.getHttpServer());
    const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

    it("lists only the caller's championships on GET /championships/mine", async () => {
        const response = await http()
            .get('/championships/mine')
            .set(bearer(tokenA))
            .expect(200);

        expect((response.body as { id: string }[]).map((c) => c.id)).toEqual([
            champA.id,
        ]);
        expect(response.body[0]).toMatchObject({
            robotCount: 0,
            fightsTotal: 0,
            fightsDone: 0,
        });
    });

    it('answers 401 on GET /championships/mine without a token', async () => {
        await http().get('/championships/mine').expect(401);
    });

    it('answers a non-owner PATCH with 404 and leaves the row unchanged', async () => {
        const response = await http()
            .patch(`/championships/${champA.id}`)
            .set(bearer(tokenB))
            .send({ name: 'Roubada' })
            .expect(404);

        expect(response.body.message).toBe('championship_not_found');
        const row = await ds
            .getRepository(Championship)
            .findOneByOrFail({ id: champA.id });
        expect(row.name).toBe('Copa A');
    });

    it('answers a non-owner DELETE with 404 and keeps the row', async () => {
        const response = await http()
            .delete(`/championships/${champA.id}`)
            .set(bearer(tokenB))
            .expect(404);

        expect(response.body.message).toBe('championship_not_found');
        await expect(
            ds.getRepository(Championship).findOneBy({ id: champA.id }),
        ).resolves.not.toBeNull();
    });

    it('answers a non-owner DELETE with 404, not 409, while a match is ongoing', async () => {
        const a = await seedRobot(ds, champA.id, { name: 'Titã' });
        const b = await seedRobot(ds, champA.id, { name: 'Marte' });
        const match = await seedMatch(ds, champA.id, a.id, b.id);
        await ds.query(
            `UPDATE "matches" SET "state" = 'ongoing' WHERE "id" = $1`,
            [match.id],
        );

        const response = await http()
            .delete(`/championships/${champA.id}`)
            .set(bearer(tokenB))
            .expect(404);

        expect(response.body.message).toBe('championship_not_found');
    });

    it('lets the owner PATCH', async () => {
        const response = await http()
            .patch(`/championships/${champA.id}`)
            .set(bearer(tokenA))
            .send({ name: 'Copa A II' })
            .expect(200);

        expect(response.body.name).toBe('Copa A II');
    });

    it('serves the six public GETs without a token, across owners', async () => {
        const robotA = await seedRobot(ds, champA.id, { name: 'Titã' });
        const robotB = await seedRobot(ds, champB.id, { name: 'Marte' });
        const robotA2 = await seedRobot(ds, champA.id, { name: 'Ferrugem' });
        const robotB2 = await seedRobot(ds, champB.id, { name: 'Zeus' });
        const matchA = await seedMatch(ds, champA.id, robotA.id, robotA2.id);
        const matchB = await seedMatch(ds, champB.id, robotB.id, robotB2.id);

        const ids = (body: unknown) =>
            (body as { id: string }[]).map((row) => row.id);

        const championships = await http().get('/championships').expect(200);
        expect(ids(championships.body)).toEqual(
            expect.arrayContaining([champA.id, champB.id]),
        );
        const robots = await http().get('/robots').expect(200);
        expect(ids(robots.body)).toEqual(
            expect.arrayContaining([robotA.id, robotB.id]),
        );
        const matches = await http().get('/matches').expect(200);
        expect(ids(matches.body)).toEqual(
            expect.arrayContaining([matchA.id, matchB.id]),
        );

        for (const [path, id] of [
            ['championships', champA.id],
            ['championships', champB.id],
            ['robots', robotA.id],
            ['robots', robotB.id],
            ['matches', matchA.id],
            ['matches', matchB.id],
        ]) {
            const found = await http().get(`/${path}/${id}`).expect(200);
            expect(found.body.id).toBe(id);
        }
    });

    describe('robots', () => {
        it("answers 404 championship_not_found when POST /robots targets another account's championship", async () => {
            const response = await http()
                .post('/robots')
                .set(bearer(tokenB))
                .send({
                    name: 'Intruso',
                    weightClass: 'lightweight',
                    team: 'Equipe B',
                    championshipId: champA.id,
                })
                .expect(404);

            expect(response.body.message).toBe('championship_not_found');
            await expect(
                ds.getRepository(Robot).countBy({ championshipId: champA.id }),
            ).resolves.toBe(0);
        });

        it('answers a non-owner PATCH with 404 and leaves the row unchanged', async () => {
            const robot = await seedRobot(ds, champA.id, { name: 'Titã' });

            const response = await http()
                .patch(`/robots/${robot.id}`)
                .set(bearer(tokenB))
                .send({ name: 'Roubado' })
                .expect(404);

            expect(response.body.message).toBe('robot_not_found');
            const row = await ds
                .getRepository(Robot)
                .findOneByOrFail({ id: robot.id });
            expect(row.name).toBe('Titã');
        });

        it('answers a non-owner DELETE with 404 and keeps the row', async () => {
            const robot = await seedRobot(ds, champA.id, { name: 'Titã' });

            const response = await http()
                .delete(`/robots/${robot.id}`)
                .set(bearer(tokenB))
                .expect(404);

            expect(response.body.message).toBe('robot_not_found');
            await expect(
                ds.getRepository(Robot).findOneBy({ id: robot.id }),
            ).resolves.not.toBeNull();
        });

        it('answers a non-owner DELETE with 404, not 409, for a robot in a match', async () => {
            const a = await seedRobot(ds, champA.id, { name: 'Titã' });
            const b = await seedRobot(ds, champA.id, { name: 'Marte' });
            await seedMatch(ds, champA.id, a.id, b.id);

            const response = await http()
                .delete(`/robots/${a.id}`)
                .set(bearer(tokenB))
                .expect(404);

            expect(response.body.message).toBe('robot_not_found');
        });

        it('lets the owner PATCH and DELETE', async () => {
            const robot = await seedRobot(ds, champA.id, { name: 'Titã' });

            const patched = await http()
                .patch(`/robots/${robot.id}`)
                .set(bearer(tokenA))
                .send({ name: 'Titã II' })
                .expect(200);
            expect(patched.body.name).toBe('Titã II');

            await http()
                .delete(`/robots/${robot.id}`)
                .set(bearer(tokenA))
                .expect(204);
        });
    });
});
