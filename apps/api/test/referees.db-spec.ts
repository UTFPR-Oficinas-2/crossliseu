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

describe('referees (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let token: string;
    let ids: { championship: string; a: string; b: string; match: string };

    beforeAll(async () => {
        app = await createTestApp();
        ds = dataSourceOf(app);
    });

    beforeEach(async () => {
        await resetDatabase(ds);
        // The first user owns the seeded championship
        await createUser(ds, 'admin', 'pw');
        token = await loginToken(app, 'admin', 'pw');
        const championship = await seedChampionship(ds);
        const a = await seedRobot(ds, championship.id, { name: 'Tritura' });
        const b = await seedRobot(ds, championship.id, { name: 'Ferrugem' });
        const match = await seedMatch(ds, championship.id, a.id, b.id);
        ids = {
            championship: championship.id,
            a: a.id,
            b: b.id,
            match: match.id,
        };
    });

    afterAll(async () => {
        await app.close();
    });

    const http = () => request(app.getHttpServer());
    const auth = (jwt = token) => ({ Authorization: `Bearer ${jwt}` });
    const command = (name: string, id = ids.match) =>
        http().post(`/matches/${id}/${name}`).set(auth()).expect(200);
    const refereeToken = (id = ids.match, jwt = token) =>
        http().post(`/matches/${id}/referee-token`).set(auth(jwt));

    describe('POST /matches/:id/referee-token', () => {
        it('creates a 22-character token', async () => {
            const response = await refereeToken().expect(200);

            expect(response.body).toEqual({
                token: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/),
            });
        });

        it('returns the same token when opened again', async () => {
            const first = await refereeToken().expect(200);
            const second = await refereeToken().expect(200);

            expect(second.body).toEqual(first.body);
        });

        it('two concurrent requests return the same token', async () => {
            const [first, second] = await Promise.all([
                refereeToken().expect(200),
                refereeToken().expect(200),
            ]);

            expect(second.body).toEqual(first.body);
        });

        it('needs a login', async () => {
            await http().post(`/matches/${ids.match}/referee-token`).expect(401);
        });

        it("404 for another user's match", async () => {
            await createUser(ds, 'other', 'pw');
            const other = await loginToken(app, 'other', 'pw');

            await refereeToken(ids.match, other).expect(404, {
                message: 'match_not_found',
                error: 'Not Found',
                statusCode: 404,
            });
        });

        it('409 match_closed after close', async () => {
            await command('start');
            await command('finish');
            await command('close');

            const response = await refereeToken().expect(409);
            expect(response.body.message).toBe('match_closed');
        });

        it('the token is not in GET /matches/:id/state?view=operator', async () => {
            const { body } = await refereeToken().expect(200);

            for (const view of ['', '?view=operator']) {
                const state = await http()
                    .get(`/matches/${ids.match}/state${view}`)
                    .expect(200);
                expect(JSON.stringify(state.body)).not.toContain(body.token);
            }
            const match = await http().get(`/matches/${ids.match}`).expect(200);
            expect(JSON.stringify(match.body)).not.toContain(body.token);
        });
    });
});
