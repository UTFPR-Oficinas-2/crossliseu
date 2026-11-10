import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { Arena } from '../src/modules/arenas/entities/arena.entity.js';
import { FightService } from '../src/modules/matches/fight/fight.service.js';
import {
    createTestApp,
    createUser,
    dataSourceOf,
    isPendingAfter,
    loginToken,
    resetDatabase,
    seedChampionship,
    seedDeviceArena,
    seedMatch,
    seedRobot,
} from './helpers.js';

// No test sends a JWT: every connection here also proves /arena is served as @Public()

type Box = {
    ws: WebSocket;
    /** The next message the server sends, parsed */
    next(): Promise<unknown>;
    closed: Promise<{ code: number }>;
};

async function openBox(url: string): Promise<Box> {
    const ws = new WebSocket(url);
    const queue: unknown[] = [];
    const waiting: ((message: unknown) => void)[] = [];
    ws.addEventListener('message', (event) => {
        const message: unknown = JSON.parse(String(event.data));
        const waiter = waiting.shift();
        if (waiter) {
            waiter(message);
        } else {
            queue.push(message);
        }
    });
    const closed = new Promise<{ code: number }>((resolve) =>
        ws.addEventListener('close', (event) => resolve({ code: event.code })),
    );
    await new Promise<void>((resolve, reject) => {
        ws.addEventListener('open', () => resolve(), { once: true });
        ws.addEventListener('error', () => reject(new Error('open failed')), {
            once: true,
        });
    });
    return {
        ws,
        closed,
        next: () =>
            queue.length > 0
                ? Promise.resolve(queue.shift())
                : new Promise((resolve) => waiting.push(resolve)),
    };
}

/** Retries the assertion until it passes or `ms` runs out */
async function eventually(fn: () => Promise<void>, ms = 2000): Promise<void> {
    const deadline = Date.now() + ms;
    for (;;) {
        try {
            await fn();
            return;
        } catch (error) {
            if (Date.now() > deadline) {
                throw error;
            }
            await new Promise((r) => setTimeout(r, 50));
        }
    }
}

function urlOf(app: INestApplication): string {
    const { port } = (
        app.getHttpServer() as { address(): AddressInfo }
    ).address();
    return `ws://127.0.0.1:${port}/arena`;
}

/** The promise's value, or a failure once `ms` runs out */
async function within<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error(`no message within ${ms} ms`)),
                    ms,
                );
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

type StateData = {
    status: string;
    matchId: string | null;
    remainingMs: number | null;
    endReason: string | null;
    robots: { A: { name: string }; B: { name: string } } | null;
};

/** The data of a `state` message; fails for any other message */
function stateOf(message: unknown): StateData {
    expect(message).toMatchObject({ event: 'state' });
    return (message as { data: StateData }).data;
}

const IDLE: StateData = {
    status: 'idle',
    matchId: null,
    remainingMs: null,
    endReason: null,
    robots: null,
};

const FIGHT_MS = 180_000;

const errorOf = (code: string) => ({
    event: 'error',
    data: { code, message: expect.any(String) },
});

describe('/arena gateway (db)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let url: string;
    let arena: Arena;
    let token: string;
    let jwt: string;
    const boxes: Box[] = [];

    const hello = (overrides: Record<string, unknown> = {}) =>
        JSON.stringify({
            event: 'hello',
            data: {
                deviceId: arena.deviceId,
                token,
                protocol: 1,
                ...overrides,
            },
        });

    async function box(): Promise<Box> {
        const opened = await openBox(url);
        boxes.push(opened);
        return opened;
    }

    /** A logged-in box, and the first `state` it got after welcome */
    async function welcomedBox(): Promise<{ box: Box; state: StateData }> {
        const opened = await box();
        opened.ws.send(hello());
        expect(await opened.next()).toEqual({
            event: 'welcome',
            data: { arenaName: 'Arena 01' },
        });
        return {
            box: opened,
            state: stateOf(await within(opened.next(), 1000)),
        };
    }

    const http = () => request(app.getHttpServer());
    const auth = () => ({ Authorization: `Bearer ${jwt}` });
    const command = (name: string, matchId: string) =>
        http().post(`/matches/${matchId}/${name}`).set(auth()).expect(200);
    const pick = (matchId: string) =>
        http()
            .put(`/arenas/${arena.id}/current-match`)
            .set(auth())
            .send({ matchId })
            .expect(200);

    /** A scheduled match between Tritura (A) and Ferrugem (B), not picked by any arena */
    async function seedFight(): Promise<{ id: string; a: string; b: string }> {
        const championship = await seedChampionship(ds);
        const a = await seedRobot(ds, championship.id, { name: 'Tritura' });
        const b = await seedRobot(ds, championship.id, { name: 'Ferrugem' });
        const match = await seedMatch(ds, championship.id, a.id, b.id);
        return { id: match.id, a: a.id, b: b.id };
    }

    /** Makes the match the arena's current one, `ongoing` since `startedAt`, straight in the database */
    async function seedOngoing(matchId: string, startedAt: Date) {
        await ds.query(
            `UPDATE "arenas" SET "current_match_id" = $1 WHERE "id" = $2`,
            [matchId, arena.id],
        );
        await ds.query(
            `UPDATE "matches" SET "state" = 'ongoing', "arena_id" = $2 WHERE "id" = $1`,
            [matchId, arena.id],
        );
        await ds.query(
            `INSERT INTO "match_events" ("match_id", "type", "occurred_at") VALUES ($1, 'started', $2)`,
            [matchId, startedAt],
        );
    }

    const matchRow = async (matchId: string) =>
        (
            await ds.query(
                `SELECT "state", "end_reason", "winner_robot_id" FROM "matches" WHERE "id" = $1`,
                [matchId],
            )
        )[0] as {
            state: string;
            end_reason: string | null;
            winner_robot_id: string | null;
        };
    const finishedEvents = async (matchId: string) =>
        (
            (await ds.query(
                `SELECT 1 FROM "match_events" WHERE "match_id" = $1 AND "type" = 'finished'`,
                [matchId],
            )) as unknown[]
        ).length;
    const surrender = (opened: Box, data: Record<string, unknown>) =>
        opened.ws.send(JSON.stringify({ event: 'surrender', data }));

    async function onlineOf(arenaId: string): Promise<boolean> {
        const response = await request(app.getHttpServer())
            .get('/arenas')
            .set('Authorization', `Bearer ${jwt}`)
            .expect(200);
        const found = (response.body as { id: string; online: boolean }[]).find(
            (row) => row.id === arenaId,
        );
        return found!.online;
    }

    beforeAll(async () => {
        app = await createTestApp();
        await app.listen(0);
        ds = dataSourceOf(app);
        url = urlOf(app);
    });

    beforeEach(async () => {
        await resetDatabase(ds);
        await createUser(ds, 'admin', 'pw');
        jwt = await loginToken(app, 'admin', 'pw');
        ({ arena, token } = await seedDeviceArena(ds, 'Arena 01'));
    });

    afterEach(async () => {
        for (const opened of boxes.splice(0)) {
            opened.ws.close();
            await opened.closed;
        }
    });

    afterAll(async () => {
        await app.close();
    });

    it('welcomes valid credentials and shows the arena online', async () => {
        const { box: opened } = await welcomedBox();
        expect(await onlineOf(arena.id)).toBe(true);

        opened.ws.close();
        await opened.closed;

        await eventually(async () =>
            expect(await onlineOf(arena.id)).toBe(false),
        );
    });

    it('closes with 4001 for a wrong token, an unknown device and a deleted arena', async () => {
        const wrongToken = await box();
        wrongToken.ws.send(hello({ token: 'nope' }));
        expect((await wrongToken.closed).code).toBe(4001);

        const unknown = await box();
        unknown.ws.send(hello({ deviceId: 'ghost-device' }));
        expect((await unknown.closed).code).toBe(4001);

        await ds.getRepository(Arena).softDelete(arena.id);
        const deleted = await box();
        deleted.ws.send(hello());
        expect((await deleted.closed).code).toBe(4001);
    });

    it('closes with 4001 for a hello without a token', async () => {
        const opened = await box();

        opened.ws.send(
            JSON.stringify({
                event: 'hello',
                data: { deviceId: arena.deviceId, protocol: 1 },
            }),
        );

        expect((await opened.closed).code).toBe(4001);
    });

    it('closes with 4002 when no hello arrives', async () => {
        const opened = await box();
        const started = Date.now();

        expect((await opened.closed).code).toBe(4002);
        expect(Date.now() - started).toBeGreaterThanOrEqual(4_900);
    });

    it('closes with 4004 for protocol 2', async () => {
        const opened = await box();

        opened.ws.send(hello({ protocol: 2 }));

        expect((await opened.closed).code).toBe(4004);
        expect(await onlineOf(arena.id)).toBe(false);
    });

    it('replaces the first box with 4003 and stays online', async () => {
        const { box: first } = await welcomedBox();
        await welcomedBox();

        expect((await first.closed).code).toBe(4003);
        // give the server time to handle the replaced socket's close
        await new Promise((r) => setTimeout(r, 200));
        expect(await onlineOf(arena.id)).toBe(true);
    });

    it('answers before-welcome and repeated hellos with error and keeps the socket open', async () => {
        const opened = await box();

        opened.ws.send(
            JSON.stringify({ event: 'surrender', data: { side: 'A' } }),
        );
        expect(await opened.next()).toEqual(errorOf('not_authenticated'));

        opened.ws.send(hello());
        expect(await opened.next()).toEqual({
            event: 'welcome',
            data: { arenaName: 'Arena 01' },
        });
        expect(stateOf(await opened.next())).toEqual(IDLE);

        opened.ws.send(hello());
        expect(await opened.next()).toEqual(errorOf('already_authenticated'));
        expect(opened.ws.readyState).toBe(WebSocket.OPEN);
        expect(await onlineOf(arena.id)).toBe(true);
    });

    it('answers bad frames with bad_frame and unknown events with unknown_event', async () => {
        const opened = await box();
        opened.ws.send('not json');
        expect(await opened.next()).toEqual(errorOf('bad_frame'));

        opened.ws.send(hello());
        await opened.next(); // welcome
        await opened.next(); // state
        opened.ws.send(JSON.stringify({ event: 'dance', data: {} }));
        expect(await opened.next()).toEqual(errorOf('unknown_event'));
        expect(opened.ws.readyState).toBe(WebSocket.OPEN);
    });

    it('closes a connected box with 4001 when its token is rotated', async () => {
        const { box: opened } = await welcomedBox();

        await request(app.getHttpServer())
            .post(`/arenas/${arena.id}/token`)
            .set('Authorization', `Bearer ${jwt}`)
            .expect(200);

        expect((await opened.closed).code).toBe(4001);
        expect(await onlineOf(arena.id)).toBe(false);
    });

    it('closes a connected box with 4001 when its arena is deleted', async () => {
        const { box: opened } = await welcomedBox();

        await request(app.getHttpServer())
            .delete(`/arenas/${arena.id}`)
            .set('Authorization', `Bearer ${jwt}`)
            .expect(204);

        expect((await opened.closed).code).toBe(4001);
    });

    it('closes an oversized frame with 1009', async () => {
        const opened = await box();

        opened.ws.send('x'.repeat(5000));

        expect((await opened.closed).code).toBe(1009);
    });

    it('closes connected boxes with 1001 on shutdown', async () => {
        const other = await createTestApp();
        await other.listen(0);
        const opened = await openBox(urlOf(other));
        opened.ws.send(hello());
        await opened.next();

        await other.close();

        expect((await opened.closed).code).toBe(1001);
    });
    describe('state push', () => {
        it('sends idle right after welcome when the arena has no match', async () => {
            const { state } = await welcomedBox();
            expect(state).toEqual(IDLE);
        });

        it('sends scheduled on pick, ongoing on start, paused, ongoing, finished/manual, then idle on close', async () => {
            const fight = await seedFight();
            const { box: opened } = await welcomedBox();
            const nextState = async () =>
                stateOf(await within(opened.next(), 1000));

            await pick(fight.id);
            expect(await nextState()).toEqual({
                status: 'scheduled',
                matchId: fight.id,
                remainingMs: FIGHT_MS,
                endReason: null,
                robots: { A: { name: 'Tritura' }, B: { name: 'Ferrugem' } },
            });

            await command('start', fight.id);
            const ongoing = await nextState();
            expect(ongoing).toMatchObject({
                status: 'ongoing',
                matchId: fight.id,
                endReason: null,
            });
            expect(ongoing.remainingMs).toBeGreaterThan(FIGHT_MS - 5_000);
            expect(ongoing.remainingMs).toBeLessThanOrEqual(FIGHT_MS);

            await command('pause', fight.id);
            const paused = await nextState();
            expect(paused).toMatchObject({ status: 'paused', endReason: null });
            expect(paused.remainingMs).toBeGreaterThan(FIGHT_MS - 5_000);
            expect(paused.remainingMs).toBeLessThanOrEqual(
                ongoing.remainingMs!,
            );

            await command('resume', fight.id);
            const resumed = await nextState();
            expect(resumed).toMatchObject({
                status: 'ongoing',
                endReason: null,
            });
            // Paused time does not count
            expect(resumed.remainingMs).toBeLessThanOrEqual(
                paused.remainingMs!,
            );
            expect(resumed.remainingMs).toBeGreaterThan(
                paused.remainingMs! - 1_000,
            );

            await command('finish', fight.id);
            const finished = await nextState();
            expect(finished).toMatchObject({
                status: 'finished',
                matchId: fight.id,
                endReason: 'manual',
            });
            expect(finished.remainingMs).toBeGreaterThan(0);
            expect(finished.remainingMs).toBeLessThanOrEqual(
                resumed.remainingMs!,
            );

            await command('close', fight.id);
            expect(await nextState()).toEqual(IDLE);
        });

        it('sends idle when the pick is undone with DELETE /arenas/:id/current-match', async () => {
            const fight = await seedFight();
            const { box: opened } = await welcomedBox();
            await pick(fight.id);
            expect(stateOf(await within(opened.next(), 1000)).status).toBe(
                'scheduled',
            );

            await http()
                .delete(`/arenas/${arena.id}/current-match`)
                .set(auth())
                .expect(200);

            expect(stateOf(await within(opened.next(), 1000))).toEqual(IDLE);
        });

        it('a box connecting mid-fight gets ongoing with the time left', async () => {
            const fight = await seedFight();
            await seedOngoing(fight.id, new Date(Date.now() - 60_000));

            const { state } = await welcomedBox();

            expect(state).toMatchObject({
                status: 'ongoing',
                matchId: fight.id,
                endReason: null,
                robots: { A: { name: 'Tritura' }, B: { name: 'Ferrugem' } },
            });
            expect(state.remainingMs).toBeGreaterThan(
                FIGHT_MS - 60_000 - 5_000,
            );
            expect(state.remainingMs).toBeLessThanOrEqual(FIGHT_MS - 60_000);
        });

        it('a box connecting to an expired ongoing match gets finished/time_out', async () => {
            const fight = await seedFight();
            await seedOngoing(fight.id, new Date(Date.now() - 181_000));

            const { state } = await welcomedBox();

            expect(state).toMatchObject({
                status: 'finished',
                matchId: fight.id,
                remainingMs: 0,
                endReason: 'time_out',
            });
            expect(await matchRow(fight.id)).toMatchObject({
                state: 'finished',
                end_reason: 'time_out',
            });
            expect(await finishedEvents(fight.id)).toBe(1);
        });

        it('the timer finishes the fight and pushes finished/time_out with no request', async () => {
            const fight = await seedFight();
            // Logged in first, so the welcome's state can't be the one that settles the time-out
            const { box: opened, state } = await welcomedBox();
            expect(state).toEqual(IDLE);
            await seedOngoing(fight.id, new Date(Date.now() - 179_500));

            await app.get(FightService).restoreTimeOuts();

            expect(stateOf(await within(opened.next(), 1500))).toMatchObject({
                status: 'finished',
                matchId: fight.id,
                remainingMs: 0,
                endReason: 'time_out',
            });
            expect(await finishedEvents(fight.id)).toBe(1);
        });
    });

    describe('surrender', () => {
        it('surrender while ongoing finishes it; GET /matches/:id shows endReason surrender and the other robot as winner', async () => {
            const fight = await seedFight();
            const { box: opened } = await welcomedBox();
            await pick(fight.id);
            await within(opened.next(), 1000);
            await command('start', fight.id);
            expect(stateOf(await within(opened.next(), 1000)).status).toBe(
                'ongoing',
            );

            surrender(opened, { side: 'A', matchId: fight.id });

            expect(stateOf(await within(opened.next(), 1000))).toMatchObject({
                status: 'finished',
                matchId: fight.id,
                endReason: 'surrender',
            });
            const response = await http()
                .get(`/matches/${fight.id}`)
                .expect(200);
            expect(response.body).toMatchObject({
                state: 'finished',
                endReason: 'surrender',
                winnerRobotId: fight.b,
            });
        });

        it('surrender while paused / scheduled / with a wrong or non-UUID matchId answers surrender_rejected and changes nothing', async () => {
            const fight = await seedFight();
            const { box: opened } = await welcomedBox();
            const rejected = async (data: Record<string, unknown>) => {
                surrender(opened, data);
                expect(await within(opened.next(), 1000)).toEqual(
                    errorOf('surrender_rejected'),
                );
            };
            const unchanged = async (state: string) => {
                expect(await matchRow(fight.id)).toEqual({
                    state,
                    end_reason: null,
                    winner_robot_id: null,
                });
                expect(await finishedEvents(fight.id)).toBe(0);
            };

            // Scheduled
            await pick(fight.id);
            await within(opened.next(), 1000);
            await rejected({ side: 'A', matchId: fight.id });
            await unchanged('scheduled');

            // Paused
            await command('start', fight.id);
            await within(opened.next(), 1000);
            await command('pause', fight.id);
            await within(opened.next(), 1000);
            await rejected({ side: 'B', matchId: fight.id });
            await unchanged('paused');

            // Ongoing, but the box names another match
            await command('resume', fight.id);
            await within(opened.next(), 1000);
            await rejected({
                side: 'A',
                matchId: '00000000-0000-4000-8000-000000000000',
            });
            await rejected({ side: 'A', matchId: 'not-a-uuid' });
            await rejected({ side: 'A', matchId: null });
            await unchanged('ongoing');

            // Malformed data is invalid_data, not a rejected surrender
            surrender(opened, { side: 'C', matchId: fight.id });
            expect(await within(opened.next(), 1000)).toEqual(
                errorOf('invalid_data'),
            );
            await unchanged('ongoing');
            expect(opened.ws.readyState).toBe(WebSocket.OPEN);
        });

        it('two surrenders in a row: one finished state, then surrender_rejected; one finished event in match_events', async () => {
            const fight = await seedFight();
            const { box: opened } = await welcomedBox();
            await pick(fight.id);
            await within(opened.next(), 1000);
            await command('start', fight.id);
            await within(opened.next(), 1000);

            // Same side twice, so whichever press counts, A wins
            surrender(opened, { side: 'B', matchId: fight.id });
            surrender(opened, { side: 'B', matchId: fight.id });

            // Handled concurrently, so the two replies may arrive in either order
            const replies = [
                await within(opened.next(), 1000),
                await within(opened.next(), 1000),
            ];
            const states = replies.filter(
                (m) => (m as { event: string }).event === 'state',
            );
            expect(states).toHaveLength(1);
            expect(stateOf(states[0])).toMatchObject({
                status: 'finished',
                endReason: 'surrender',
            });
            expect(replies).toContainEqual(errorOf('surrender_rejected'));
            // Nothing else follows: the rejected press pushed no second state
            expect(await isPendingAfter(opened.next(), 300)).toBe(true);

            expect(await finishedEvents(fight.id)).toBe(1);
            expect(await matchRow(fight.id)).toEqual({
                state: 'finished',
                end_reason: 'surrender',
                winner_robot_id: fight.a,
            });
        });
    });
});
