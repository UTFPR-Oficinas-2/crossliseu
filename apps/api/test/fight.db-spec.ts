import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { Clock } from '../src/modules/matches/fight/clock.js';
import {
    createTestApp,
    createUser,
    dataSourceOf,
    loginToken,
    resetDatabase,
    seedArena,
    seedChampionship,
    seedMatch,
    seedRobot,
} from './helpers.js';

const T0 = new Date('2026-11-09T12:00:00Z');

/** A clock the tests move by hand */
class FakeClock extends Clock {
    current = T0;
    now(): Date {
        return this.current;
    }
    advance(ms: number) {
        this.current = new Date(this.current.getTime() + ms);
    }
}

describe('fight (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let clock: FakeClock;
    let token: string;
    let ids: { championship: string; a: string; b: string; match: string };

    beforeAll(async () => {
        clock = new FakeClock();
        app = await createTestApp((builder) =>
            builder.overrideProvider(Clock).useValue(clock),
        );
        ds = dataSourceOf(app);
    });

    beforeEach(async () => {
        clock.current = T0;
        await resetDatabase(ds);
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
    const auth = () => ({ Authorization: `Bearer ${token}` });
    const command = (name: string, id = ids.match) =>
        http().post(`/matches/${id}/${name}`).set(auth());
    const events = async (id = ids.match) =>
        (await ds.query(
            `SELECT "type", "occurred_at" FROM "match_events" WHERE "match_id" = $1 ORDER BY "occurred_at", "id"`,
            [id],
        )) as { type: string; occurred_at: Date }[];
    const matchRow = async () =>
        (
            await ds.query(
                `SELECT "state", "end_reason", "arena_id" FROM "matches" WHERE "id" = $1`,
                [ids.match],
            )
        )[0] as { state: string; end_reason: string | null; arena_id: string };
    const expireFight = async () => {
        await command('start').expect(200);
        clock.advance(181_000);
    };

    it('runs a full fight: start, pause, resume, finish, close, with remainingMs right at each step', async () => {
        const started = await command('start').expect(200);
        expect(started.body).toEqual({
            status: 'ongoing',
            matchId: ids.match,
            remainingMs: 180_000,
            endReason: null,
            robots: { A: { name: 'Tritura' }, B: { name: 'Ferrugem' } },
        });

        clock.advance(30_000);
        const paused = await command('pause').expect(200);
        expect(paused.body).toMatchObject({
            status: 'paused',
            remainingMs: 150_000,
        });

        clock.advance(60_000);
        const still = await http().get(`/matches/${ids.match}/state`);
        expect(still.body.remainingMs).toBe(150_000);

        const resumed = await command('resume').expect(200);
        expect(resumed.body).toMatchObject({
            status: 'ongoing',
            remainingMs: 150_000,
        });

        clock.advance(20_000);
        const finished = await command('finish').expect(200);
        expect(finished.body).toMatchObject({
            status: 'finished',
            remainingMs: 130_000,
            endReason: 'manual',
        });

        const closed = await command('close').expect(200);
        expect(closed.body).toMatchObject({
            status: 'finished',
            endReason: 'manual',
        });
        expect((await events()).map((e) => e.type)).toEqual([
            'started',
            'paused',
            'resumed',
            'finished',
            'closed',
        ]);
    });

    it('GET /matches/:id/state is public and has the /arena state shape', async () => {
        const response = await http()
            .get(`/matches/${ids.match}/state`)
            .expect(200);
        expect(response.body).toEqual({
            status: 'scheduled',
            matchId: ids.match,
            remainingMs: 180_000,
            endReason: null,
            robots: { A: { name: 'Tritura' }, B: { name: 'Ferrugem' } },
        });
        await http()
            .get('/matches/00000000-0000-4000-8000-000000000000/state')
            .expect(404);
    });

    it("start records arena_id from the arena's current match", async () => {
        const arena = await seedArena(ds, 'Arena 1');
        await ds.query(
            `UPDATE "arenas" SET "current_match_id" = $1 WHERE "id" = $2`,
            [ids.match, arena.id],
        );

        await command('start').expect(200);

        expect((await matchRow()).arena_id).toBe(arena.id);
    });

    it('start with no arena leaves arena_id null', async () => {
        await command('start').expect(200);
        expect((await matchRow()).arena_id).toBeNull();
    });

    it("close clears the arena's current match and the arena can take the next fight", async () => {
        const arena = await seedArena(ds, 'Arena 1');
        const next = await seedMatch(ds, ids.championship, ids.a, ids.b);
        await http()
            .put(`/arenas/${arena.id}/current-match`)
            .set(auth())
            .send({ matchId: ids.match })
            .expect(200);
        await command('start').expect(200);
        await command('finish').expect(200);
        await command('close').expect(200);

        const [row] = await ds.query(
            `SELECT "current_match_id" FROM "arenas" WHERE "id" = $1`,
            [arena.id],
        );
        expect(row.current_match_id).toBeNull();
        expect((await matchRow()).arena_id).toBe(arena.id);

        await http()
            .put(`/arenas/${arena.id}/current-match`)
            .set(auth())
            .send({ matchId: next.id })
            .expect(200);
    });

    it('close of a fight whose arena was deleted still records closed', async () => {
        const arena = await seedArena(ds, 'Arena 1');
        await ds.query(
            `UPDATE "arenas" SET "current_match_id" = $1 WHERE "id" = $2`,
            [ids.match, arena.id],
        );
        await command('start').expect(200);
        await command('finish').expect(200);
        await ds.query(
            `UPDATE "arenas" SET "deleted_at" = now() WHERE "id" = $1`,
            [arena.id],
        );

        await command('close').expect(200);

        expect((await events()).map((e) => e.type)).toContain('closed');
        const [row] = await ds.query(
            `SELECT "current_match_id" FROM "arenas" WHERE "id" = $1`,
            [arena.id],
        );
        expect(row.current_match_id).toBe(ids.match);
        // The fight keeps its arena as history
        expect((await matchRow()).arena_id).toBe(arena.id);
    });

    it('a non-owner gets 404 on every command', async () => {
        await createUser(ds, 'other', 'pw');
        const other = await loginToken(app, 'other', 'pw');
        for (const name of ['start', 'pause', 'resume', 'finish', 'close']) {
            const response = await http()
                .post(`/matches/${ids.match}/${name}`)
                .set({ Authorization: `Bearer ${other}` })
                .expect(404);
            expect(response.body.message).toBe('match_not_found');
        }
        await http()
            .post('/matches/00000000-0000-4000-8000-000000000000/start')
            .set(auth())
            .expect(404);
        expect(await events()).toEqual([]);
        expect((await matchRow()).state).toBe('scheduled');
    });

    it('invalid transitions return 409 match_invalid_transition', async () => {
        const invalid = async (name: string) => {
            const response = await command(name).expect(409);
            expect(response.body.message).toBe('match_invalid_transition');
        };
        await invalid('pause');
        await invalid('resume');
        await invalid('finish');
        await invalid('close');
        await command('start').expect(200);
        await invalid('start');
        await invalid('resume');
        await invalid('close');
        await command('finish').expect(200);
        await invalid('pause');
        await invalid('finish');
        await command('close').expect(200);
        await invalid('close');
    });

    it('remainingMs survives an app restart', async () => {
        await command('start').expect(200);
        clock.advance(45_000);
        await command('pause').expect(200);
        clock.advance(10_000);
        await command('resume').expect(200);
        clock.advance(5_000);

        // The app shares its DataSource, so the old one is closed first and the new one replaces it
        await app.close();
        app = await createTestApp((builder) =>
            builder.overrideProvider(Clock).useValue(clock),
        );
        ds = dataSourceOf(app);

        const response = await http()
            .get(`/matches/${ids.match}/state`)
            .expect(200);
        expect(response.body).toMatchObject({
            status: 'ongoing',
            remainingMs: 130_000,
        });
    });

    it('an expired fight reads as finished/time_out from GET /matches/:id, GET /matches and GET /matches/:id/state', async () => {
        await expireFight();
        const one = await http().get(`/matches/${ids.match}`).expect(200);
        expect(one.body.state).toBe('finished');
        expect(one.body.endReason).toBe('time_out');

        await ds.query(
            `DELETE FROM "match_events" WHERE "match_id" = $1 AND "type" = 'finished'`,
            [ids.match],
        );
        await ds.query(
            `UPDATE "matches" SET "state" = 'ongoing', "end_reason" = NULL WHERE "id" = $1`,
            [ids.match],
        );
        const list = await http().get('/matches').expect(200);
        expect(list.body).toHaveLength(1);
        expect(list.body[0]).toMatchObject({
            state: 'finished',
            endReason: 'time_out',
        });

        await ds.query(
            `DELETE FROM "match_events" WHERE "match_id" = $1 AND "type" = 'finished'`,
            [ids.match],
        );
        await ds.query(
            `UPDATE "matches" SET "state" = 'ongoing', "end_reason" = NULL WHERE "id" = $1`,
            [ids.match],
        );
        const state = await http()
            .get(`/matches/${ids.match}/state`)
            .expect(200);
        expect(state.body).toMatchObject({
            status: 'finished',
            endReason: 'time_out',
            remainingMs: 0,
        });
        const finished = (await events()).filter((e) => e.type === 'finished');
        expect(finished).toHaveLength(1);
        expect(finished[0].occurred_at.toISOString()).toBe(
            '2026-11-09T12:03:00.000Z',
        );
    });

    it('pause on an expired fight is 409 and the time-out stays written', async () => {
        await expireFight();

        const response = await command('pause').expect(409);
        expect(response.body.message).toBe('match_invalid_transition');

        const row = await matchRow();
        expect(row.state).toBe('finished');
        expect(row.end_reason).toBe('time_out');
        expect(
            (await events()).filter((e) => e.type === 'finished'),
        ).toHaveLength(1);
    });

    /**
     * Holds the match's row lock, fires the requests, waits until every one of them is blocked on
     * a lock, then releases it. A run that did not take the lock would never block, and the wait
     * would time out.
     */
    async function whileMatchLocked<T>(fire: () => Promise<T>[]): Promise<T[]> {
        const runner = ds.createQueryRunner();
        await runner.connect();
        await runner.startTransaction();
        try {
            await runner.query(
                `SELECT 1 FROM "matches" WHERE "id" = $1 FOR UPDATE`,
                [ids.match],
            );
            const pending = fire();
            const deadline = Date.now() + 5000;
            for (;;) {
                const [{ waiting }] = (await ds.query(
                    `SELECT count(*)::int AS waiting FROM pg_stat_activity
                     WHERE datname = current_database() AND wait_event_type = 'Lock'`,
                )) as { waiting: number }[];
                if (waiting >= pending.length) {
                    break;
                }
                if (Date.now() > deadline) {
                    throw new Error(
                        `only ${waiting} of ${pending.length} requests waited for the lock`,
                    );
                }
                await new Promise((r) => setTimeout(r, 20));
            }
            await runner.commitTransaction();
            return await Promise.all(pending);
        } finally {
            if (runner.isTransactionActive) {
                await runner.rollbackTransaction();
            }
            await runner.release();
        }
    }

    // supertest sends on then(), so this starts the request without waiting for it
    const send = (req: request.Test) => req.then((response) => response);

    it('two concurrent finish calls: one 200, one 409, one finished event', async () => {
        await command('start').expect(200);
        clock.advance(10_000);

        const responses = await whileMatchLocked(() => [
            send(command('finish')),
            send(command('finish')),
        ]);

        expect(responses.map((r) => r.status).sort((x, y) => x - y)).toEqual([
            200, 409,
        ]);
        expect(
            (await events()).filter((e) => e.type === 'finished'),
        ).toHaveLength(1);
    });

    it('two concurrent close calls: one 200, one 409, one closed event', async () => {
        await command('start').expect(200);
        await command('finish').expect(200);

        const responses = await whileMatchLocked(() => [
            send(command('close')),
            send(command('close')),
        ]);

        expect(responses.map((r) => r.status).sort((x, y) => x - y)).toEqual([
            200, 409,
        ]);
        expect(
            (await events()).filter((e) => e.type === 'closed'),
        ).toHaveLength(1);
    });

    it('two concurrent reads of an expired fight write one finished event and both succeed', async () => {
        await expireFight();

        const responses = await whileMatchLocked(() => [
            send(http().get(`/matches/${ids.match}/state`)),
            send(http().get(`/matches/${ids.match}/state`)),
        ]);

        expect(responses.map((r) => r.status)).toEqual([200, 200]);
        for (const r of responses) {
            expect(r.body).toMatchObject({
                status: 'finished',
                endReason: 'time_out',
            });
        }
        expect(
            (await events()).filter((e) => e.type === 'finished'),
        ).toHaveLength(1);
    });

    it('a read of a fight with time left does not wait for the match lock', async () => {
        await command('start').expect(200);
        clock.advance(10_000);

        const [response] = await (async () => {
            const runner = ds.createQueryRunner();
            await runner.connect();
            await runner.startTransaction();
            try {
                await runner.query(
                    `SELECT 1 FROM "matches" WHERE "id" = $1 FOR UPDATE`,
                    [ids.match],
                );
                const read = send(http().get(`/matches/${ids.match}/state`));
                return [await read];
            } finally {
                await runner.rollbackTransaction();
                await runner.release();
            }
        })();

        expect(response.status).toBe(200);
        expect(response.body.remainingMs).toBe(170_000);
    });

    it('GET /matches/:id still returns arenaId', async () => {
        const before = await http().get(`/matches/${ids.match}`).expect(200);
        expect(before.body.arenaId).toBeNull();

        const arena = await seedArena(ds, 'Arena 1');
        await ds.query(
            `UPDATE "arenas" SET "current_match_id" = $1 WHERE "id" = $2`,
            [ids.match, arena.id],
        );
        await command('start').expect(200);

        const after = await http().get(`/matches/${ids.match}`).expect(200);
        expect(after.body.arenaId).toBe(arena.id);
    });
});
