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
import { RefereesService } from '../src/modules/matches/referees/referees.service.js';

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
            await http()
                .post(`/matches/${ids.match}/referee-token`)
                .expect(401);
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

    describe('POST /referee/join', () => {
        let shared: string;

        beforeEach(async () => {
            shared = (
                (await refereeToken().expect(200)).body as { token: string }
            ).token;
        });

        const join = (name: string, tokenValue = shared) =>
            http().post('/referee/join').send({ token: tokenValue, name });
        const scored = (robotId: string, seat: number, action: number) =>
            ds.query(
                `INSERT INTO "match_events" ("match_id", "type", "occurred_at", "robot_id", "judge_seat", "action")
                 VALUES ($1, 'scored', now(), $2, $3, $4)`,
                [ids.match, robotId, seat, action],
            );

        it('three names get seats 1, 2, 3', async () => {
            const seats = [];
            for (const name of ['Ana', 'Bia', 'Caio']) {
                seats.push((await join(name).expect(200)).body);
            }

            expect(seats).toEqual([
                {
                    matchId: ids.match,
                    seat: 1,
                    name: 'Ana',
                    counts: { A: 0, B: 0 },
                },
                {
                    matchId: ids.match,
                    seat: 2,
                    name: 'Bia',
                    counts: { A: 0, B: 0 },
                },
                {
                    matchId: ids.match,
                    seat: 3,
                    name: 'Caio',
                    counts: { A: 0, B: 0 },
                },
            ]);
        });

        it('a fourth name gets 409 referee_seats_full', async () => {
            for (const name of ['Ana', 'Bia', 'Caio']) {
                await join(name).expect(200);
            }

            const response = await join('Davi').expect(409);
            expect(response.body.message).toBe('referee_seats_full');
        });

        it('rejoining with other case and spacing returns the same seat', async () => {
            await join(' Ana ').expect(200);
            await join('Bia').expect(200);

            const again = await join('ana').expect(200);
            expect(again.body).toMatchObject({ seat: 1, name: 'Ana' });
        });

        it('a seated name still rejoins once the seats are full', async () => {
            for (const name of ['Ana', 'Bia', 'Caio']) {
                await join(name).expect(200);
            }

            const again = await join('CAIO').expect(200);
            expect(again.body).toMatchObject({ seat: 3, name: 'Caio' });
        });

        it('three concurrent joins get three different seats', async () => {
            const responses = await Promise.all(
                ['Ana', 'Bia', 'Caio'].map((name) => join(name).expect(200)),
            );

            expect(
                responses.map((r) => (r.body as { seat: number }).seat).sort(),
            ).toEqual([1, 2, 3]);
        });

        it('an unknown token gets 401 referee_invalid_token', async () => {
            const response = await join('Ana', 'nope').expect(401);
            expect(response.body.message).toBe('referee_invalid_token');
        });

        it("a closed match's token gets 401", async () => {
            await command('start');
            await command('finish');
            await command('close');

            const response = await join('Ana').expect(401);
            expect(response.body.message).toBe('referee_invalid_token');
        });

        it("a deleted match's token is refused", async () => {
            await http()
                .delete(`/matches/${ids.match}`)
                .set(auth())
                .expect(204);

            const response = await join('Ana').expect(401);
            expect(response.body.message).toBe('referee_invalid_token');
        });

        it("the join returns the referee's own counts", async () => {
            await join('Ana').expect(200);
            await join('Bia').expect(200);
            await scored(ids.a, 1, 1);
            await scored(ids.a, 1, 1);
            await scored(ids.b, 2, 1);

            const again = await join('Ana').expect(200);
            expect(again.body.counts).toEqual({ A: 2, B: 0 });
        });

        it('a 41-character name gets 400', async () => {
            await join('a'.repeat(41)).expect(400);
            await join('a'.repeat(40)).expect(200);
        });

        it('a blank name gets 400', async () => {
            await join('   ').expect(400);
        });

        it('joining before Start works', async () => {
            await join('Ana').expect(200);
        });
    });

    describe('RefereesService.resolve', () => {
        let shared: string;
        const resolve = (name: string, tokenValue = shared) =>
            app.get(RefereesService).resolve(tokenValue, name);

        beforeEach(async () => {
            shared = (
                (await refereeToken().expect(200)).body as { token: string }
            ).token;
            await http()
                .post('/referee/join')
                .send({ token: shared, name: 'Ana' })
                .expect(200);
        });

        it('finds a seated name in any case and spacing', async () => {
            expect(await resolve('  ANA ')).toEqual({
                matchId: ids.match,
                seat: 1,
            });
        });

        it('is null for a name without a seat', async () => {
            expect(await resolve('Bia')).toBeNull();
        });

        it('is null for an unknown token', async () => {
            expect(await resolve('Ana', 'nope')).toBeNull();
        });

        it('is null once the fight is closed', async () => {
            await command('start');
            await command('finish');
            await command('close');

            expect(await resolve('Ana')).toBeNull();
        });

        it('is null for a deleted match', async () => {
            await ds.query(
                `UPDATE "matches" SET "deleted_at" = now() WHERE "id" = $1`,
                [ids.match],
            );

            expect(await resolve('Ana')).toBeNull();
        });
    });
});
