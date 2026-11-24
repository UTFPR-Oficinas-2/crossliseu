import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
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

type Client = {
    ws: WebSocket;
    /** The next frame the server sends, parsed */
    next(): Promise<{ event: string; data: unknown }>;
    closed: Promise<{ code: number }>;
};

async function openClient(url: string): Promise<Client> {
    const ws = new WebSocket(url);
    const queue: { event: string; data: unknown }[] = [];
    const waiting: ((frame: { event: string; data: unknown }) => void)[] = [];
    ws.addEventListener('message', (event) => {
        const frame = JSON.parse(String(event.data)) as {
            event: string;
            data: unknown;
        };
        const waiter = waiting.shift();
        if (waiter) {
            waiter(frame);
        } else {
            queue.push(frame);
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
        next: () => {
            const frame = queue.shift();
            return frame
                ? Promise.resolve(frame)
                : new Promise((resolve) => waiting.push(resolve));
        },
    };
}

/** The promise's value, or a failure once `ms` runs out */
async function within<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error(`nothing within ${ms} ms`)),
                    ms,
                );
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

describe('referees on the live channel (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let url: string;
    let jwt: string;
    let matchId: string;
    let shared: string;
    const clients: Client[] = [];

    beforeAll(async () => {
        app = await createTestApp();
        await app.listen(0);
        ds = dataSourceOf(app);
        const { port } = (
            app.getHttpServer() as { address(): AddressInfo }
        ).address();
        url = `ws://127.0.0.1:${port}/fights`;
    });

    beforeEach(async () => {
        await resetDatabase(ds);
        await createUser(ds, 'admin', 'pw');
        jwt = await loginToken(app, 'admin', 'pw');
        const championship = await seedChampionship(ds);
        const a = await seedRobot(ds, championship.id, { name: 'Tritura' });
        const b = await seedRobot(ds, championship.id, { name: 'Ferrugem' });
        matchId = (await seedMatch(ds, championship.id, a.id, b.id)).id;
        shared = (
            (
                await http()
                    .post(`/matches/${matchId}/referee-token`)
                    .set(auth())
                    .expect(200)
            ).body as { token: string }
        ).token;
        await http()
            .post('/referee/join')
            .send({ token: shared, name: 'Ana' })
            .expect(200);
    });

    afterEach(async () => {
        for (const client of clients.splice(0)) {
            client.ws.close();
            await client.closed;
        }
    });

    afterAll(async () => {
        await app.close();
    });

    const http = () => request(app.getHttpServer());
    const auth = () => ({ Authorization: `Bearer ${jwt}` });
    const command = (name: string) =>
        http().post(`/matches/${matchId}/${name}`).set(auth()).expect(200);

    /** A socket that sent `auth`; the operator sends no `name` */
    async function subscribe(token: string, name?: string) {
        const client = await openClient(url);
        clients.push(client);
        client.ws.send(
            JSON.stringify({ event: 'auth', data: { matchId, token, name } }),
        );
        return client;
    }

    async function subscribed(token: string, name?: string) {
        const client = await subscribe(token, name);
        const first = await within(client.next(), 2_000);
        expect(first.event).toBe('state');
        return client;
    }

    it('a seated referee subscribes and gets the public state', async () => {
        const client = await subscribe(shared, 'ana');

        const first = await within(client.next(), 2_000);
        expect(first).toMatchObject({
            event: 'state',
            data: { matchId, status: 'scheduled', score: { A: 0, B: 0 } },
        });
        expect(first.data).not.toHaveProperty('closed');
    });

    it('after finish a referee gets the public state, without the proposal or the draw (#50)', async () => {
        await command('start');
        await command('finish');
        const operator = await subscribe(jwt);
        const referee = await subscribe(shared, 'Ana');

        const [operatorFrame, refereeFrame] = await Promise.all([
            within(operator.next(), 2_000),
            within(referee.next(), 2_000),
        ]);

        expect(operatorFrame.data).toMatchObject({
            status: 'finished',
            proposal: { outcome: 'draw', basis: 'tied' },
            draw: false,
        });
        expect(refereeFrame.data).toMatchObject({ status: 'finished' });
        expect(refereeFrame.data).not.toHaveProperty('proposal');
        expect(refereeFrame.data).not.toHaveProperty('draw');
    });

    it('a score POST reaches another subscribed socket within 1 s', async () => {
        await command('start');
        const operator = await subscribed(jwt);

        await http()
            .post(`/matches/${matchId}/scores`)
            .send({ token: shared, name: 'Ana', side: 'A', action: 1 })
            .expect(201);

        const frame = await within(operator.next(), 1_000);
        expect(frame).toMatchObject({
            event: 'state',
            data: { score: { A: 1, B: 0 } },
        });
    });

    it('a referee socket is closed with 4001 after close, the operator stays', async () => {
        const referee = await subscribed(shared, 'Ana');
        const operator = await subscribed(jwt);
        await command('start');
        await command('finish');

        await command('close');

        expect(await within(referee.closed, 2_000)).toEqual({ code: 4001 });
        expect(operator.ws.readyState).toBe(WebSocket.OPEN);
    });

    it('a referee auth for a closed match is closed with 4001', async () => {
        await command('start');
        await command('finish');
        await command('close');

        const client = await subscribe(shared, 'Ana');

        expect(await within(client.closed, 2_000)).toEqual({ code: 4001 });
    });

    it('an unseated name is closed with 4001', async () => {
        const client = await subscribe(shared, 'Bia');

        expect(await within(client.closed, 2_000)).toEqual({ code: 4001 });
    });

    it('join and free push a state to a subscribed operator socket', async () => {
        const operator = await subscribed(jwt);

        await http()
            .post('/referee/join')
            .send({ token: shared, name: 'Bia' })
            .expect(200);
        expect((await within(operator.next(), 1_000)).event).toBe('state');

        await http()
            .delete(`/matches/${matchId}/referees/2`)
            .set(auth())
            .expect(204);
        expect((await within(operator.next(), 1_000)).event).toBe('state');
    });
});
