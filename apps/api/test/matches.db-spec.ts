import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import {
    createTestApp,
    createUser,
    dataSourceOf,
    loginToken,
    resetDatabase,
    seedChampionship,
    seedMatch,
    seedRobot,
} from './helpers.js';

describe('matches (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let token: string;
    let ids: { championship: string; a: string; b: string; c: string };

    beforeAll(async () => {
        app = await createTestApp();
        ds = dataSourceOf(app);
    });

    beforeEach(async () => {
        await resetDatabase(ds);
        await createUser(ds, 'admin', 'pw');
        token = await loginToken(app, 'admin', 'pw');
        const championship = await seedChampionship(ds);
        const [a, b, c] = await Promise.all(
            ['Titã', 'Marte', 'Ferrugem'].map((name) =>
                seedRobot(ds, championship.id, { name }),
            ),
        );
        ids = { championship: championship.id, a: a.id, b: b.id, c: c.id };
    });

    afterAll(async () => {
        await app.close();
    });

    const http = () => request(app.getHttpServer());
    const auth = () => ({ Authorization: `Bearer ${token}` });

    it('returns the robots from create, GET by id and PATCH', async () => {
        const created = await http()
            .post('/matches')
            .set(auth())
            .send({
                championshipId: ids.championship,
                robotAId: ids.a,
                robotBId: ids.b,
                scheduledAt: '2026-11-04T13:00:00Z',
            })
            .expect(201);
        expect(created.body.robotA.name).toBe('Titã');
        expect(created.body.robotB.name).toBe('Marte');

        const found = await http()
            .get(`/matches/${created.body.id}`)
            .expect(200);
        expect(found.body.robotA.name).toBe('Titã');

        const patched = await http()
            .patch(`/matches/${created.body.id}`)
            .set(auth())
            .send({ robotBId: ids.c })
            .expect(200);
        expect(patched.body.robotB.name).toBe('Ferrugem');
    });

    it('does not edit a match that is no longer waiting', async () => {
        const match = await seedMatch(ds, ids.championship, ids.a, ids.b);
        await ds.query(
            `UPDATE "matches" SET "state" = 'ongoing' WHERE "id" = $1`,
            [match.id],
        );

        await http()
            .patch(`/matches/${match.id}`)
            .set(auth())
            .send({ robotBId: ids.c })
            .expect(409);

        const [row] = await ds.query(
            `SELECT "robot_b_id" FROM "matches" WHERE "id" = $1`,
            [match.id],
        );
        expect(row.robot_b_id).toBe(ids.b);
    });

    it('never edits a deleted match back to life', async () => {
        const match = await seedMatch(ds, ids.championship, ids.a, ids.b);
        await http().delete(`/matches/${match.id}`).set(auth()).expect(204);

        await http()
            .patch(`/matches/${match.id}`)
            .set(auth())
            .send({ robotBId: ids.c })
            .expect(404);

        const [row] = await ds.query(
            `SELECT "deleted_at", "robot_b_id" FROM "matches" WHERE "id" = $1`,
            [match.id],
        );
        expect(row.deleted_at).not.toBeNull();
        expect(row.robot_b_id).toBe(ids.b);
    });

    it('lets exactly one of a PATCH and a DELETE sent together win cleanly', async () => {
        const match = await seedMatch(ds, ids.championship, ids.a, ids.b);

        const [patch, remove] = await Promise.all([
            http()
                .patch(`/matches/${match.id}`)
                .set(auth())
                .send({ robotBId: ids.c }),
            http().delete(`/matches/${match.id}`).set(auth()),
        ]);

        expect(remove.status).toBe(204);
        expect([200, 404]).toContain(patch.status);
        const [row] = await ds.query(
            `SELECT "deleted_at" FROM "matches" WHERE "id" = $1`,
            [match.id],
        );
        expect(row.deleted_at).not.toBeNull();
    });
});
