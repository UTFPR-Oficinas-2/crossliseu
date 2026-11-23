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

        it('rejoining matches names the way the database lowercases them', async () => {
            await join('İsa').expect(200);

            const again = await join('isa').expect(200);
            expect(again.body).toMatchObject({ seat: 1, name: 'İsa' });
        });

        it('"João" then "joao" gets the same seat', async () => {
            await join('João').expect(200);

            const again = await join('joao').expect(200);
            expect(again.body).toMatchObject({ seat: 1, name: 'João' });
        });

        it('an accented rejoin finds the seat when the seats are full', async () => {
            for (const name of ['Joao', 'Bia', 'Caio']) {
                await join(name).expect(200);
            }
            await command('start');

            const again = await join('JOÃO').expect(200);
            expect(again.body).toMatchObject({ seat: 1, name: 'Joao' });
        });

        it('a name with nothing left after removing accents gets 400', async () => {
            const response = await join('\u0301').expect(400);
            expect(response.body.message).toBe('referee_name_invalid');
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
                responses
                    .map((r) => (r.body as { seat: number }).seat)
                    .sort((x, y) => x - y),
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

    describe('POST /matches/:id/scores', () => {
        let shared: string;

        beforeEach(async () => {
            shared = (
                (await refereeToken().expect(200)).body as { token: string }
            ).token;
            for (const name of ['Ana', 'Bia']) {
                await http()
                    .post('/referee/join')
                    .send({ token: shared, name })
                    .expect(200);
            }
        });

        const press = (body: Record<string, unknown>, id = ids.match) =>
            http()
                .post(`/matches/${id}/scores`)
                .send({
                    token: shared,
                    name: 'Ana',
                    side: 'A',
                    action: 1,
                    ...body,
                });
        const score = async () =>
            (
                (await http().get(`/matches/${ids.match}/state`).expect(200))
                    .body as { score: { A: number; B: number } }
            ).score;

        it('a seated referee scores while ongoing and gets 201 with own counts', async () => {
            await command('start');

            const response = await press({}).expect(201);

            expect(response.body).toEqual({ counts: { A: 1, B: 0 } });
            expect(await score()).toEqual({ A: 1, B: 0 });
            const [row] = await ds.query<
                { judge_seat: number; robot_id: string; action: number }[]
            >(
                `SELECT "judge_seat", "robot_id", "action" FROM "match_events" WHERE "type" = 'scored'`,
            );
            expect(row).toEqual({ judge_seat: 1, robot_id: ids.a, action: 1 });
        });

        it('is refused before Start with match_not_running', async () => {
            const response = await press({}).expect(409);
            expect(response.body.message).toBe('match_not_running');
        });

        it('−1 at 0 is score_below_zero', async () => {
            await command('start');

            const response = await press({ action: -1 }).expect(409);
            expect(response.body.message).toBe('score_below_zero');
        });

        it('a token for another match is refused', async () => {
            const other = await seedMatch(ds, ids.championship, ids.a, ids.b);
            await command('start', other.id);

            const response = await press({}, other.id).expect(401);
            expect(response.body.message).toBe('referee_invalid_token');
        });

        it('an unseated name is refused', async () => {
            await command('start');

            await press({ name: 'Caio' }).expect(401);
        });

        it('a score from "joão" counts for the "Joao" seat', async () => {
            await http()
                .post('/referee/join')
                .send({ token: shared, name: 'Joao' })
                .expect(200);
            await command('start');

            const response = await press({ name: 'joão' }).expect(201);
            expect(response.body).toEqual({ counts: { A: 1, B: 0 } });
        });

        it('the name matches in any case', async () => {
            await command('start');

            await press({ name: ' ana ' }).expect(201);
        });

        it('concurrent presses from two seats are both counted', async () => {
            await command('start');

            await Promise.all([
                press({ name: 'Ana' }).expect(201),
                press({ name: 'Bia' }).expect(201),
            ]);

            expect(await score()).toEqual({ A: 2, B: 0 });
        });

        it.each([[{ side: 'C' }], [{ action: 2 }], [{ action: 0 }]])(
            '%j gets 400',
            async (body) => {
                await command('start');

                await press(body).expect(400);
            },
        );
    });

    describe('seats: GET and DELETE /matches/:id/referees', () => {
        let shared: string;
        const join = (name: string) =>
            http()
                .post('/referee/join')
                .send({ token: shared, name })
                .expect(200);
        const seats = (jwt = token) =>
            http().get(`/matches/${ids.match}/referees`).set(auth(jwt));
        const free = (seat: number | string, jwt = token) =>
            http()
                .delete(`/matches/${ids.match}/referees/${seat}`)
                .set(auth(jwt));

        beforeEach(async () => {
            shared = (
                (await refereeToken().expect(200)).body as { token: string }
            ).token;
        });

        it('lists seats in seat order', async () => {
            for (const name of ['Ana', 'Bia', 'Caio']) {
                await join(name);
            }
            await free(1).expect(204);
            await join('Davi');

            expect((await seats().expect(200)).body).toEqual([
                { seat: 1, name: 'Davi' },
                { seat: 2, name: 'Bia' },
                { seat: 3, name: 'Caio' },
            ]);
        });

        it('a non-owner gets 404 on list and free', async () => {
            await join('Ana');
            await createUser(ds, 'other', 'pw');
            const other = await loginToken(app, 'other', 'pw');

            await seats(other).expect(404);
            await free(1, other).expect(404);
            expect((await seats().expect(200)).body).toHaveLength(1);
        });

        it('needs a login', async () => {
            await http().get(`/matches/${ids.match}/referees`).expect(401);
            await http().delete(`/matches/${ids.match}/referees/1`).expect(401);
        });

        it('free before Start lets a new name take the seat', async () => {
            for (const name of ['Ana', 'Bia', 'Caio']) {
                await join(name);
            }

            await free(2).expect(204);

            const davi = await join('Davi');
            expect(davi.body).toMatchObject({
                seat: 2,
                name: 'Davi',
                counts: { A: 0, B: 0 },
            });
        });

        it('free after Start gets 409 match_started', async () => {
            await join('Ana');
            await command('start');

            const response = await free(1).expect(409);
            expect(response.body.message).toBe('match_started');
            expect((await seats().expect(200)).body).toHaveLength(1);
        });

        it('freeing an empty seat is 204', async () => {
            await free(3).expect(204);
        });

        it.each([4, 0, 'x'])('seat %j gets 400', async (seat) => {
            await free(seat).expect(400);
        });

        it("the freed name's credential no longer scores", async () => {
            await join('Ana');
            await free(1).expect(204);
            await command('start');

            await http()
                .post(`/matches/${ids.match}/scores`)
                .send({ token: shared, name: 'Ana', side: 'A', action: 1 })
                .expect(401);
        });

        it('free and start at once never frees a started fight', async () => {
            await join('Ana');

            const [freed, started] = await Promise.all([
                free(1),
                http().post(`/matches/${ids.match}/start`).set(auth()),
            ]);

            expect(started.status).toBe(200);
            const left = (await seats().expect(200)).body as unknown[];
            if (freed.status === 409) {
                expect(left).toHaveLength(1);
            } else {
                expect(freed.status).toBe(204);
                expect(left).toHaveLength(0);
            }
        });
    });
});
