import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { Arena } from '../src/modules/arenas/entities/arena.entity.js';
import {
    createTestApp,
    createUser,
    dataSourceOf,
    loginToken,
    resetDatabase,
    seedDeviceArena,
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

    async function welcomedBox(): Promise<Box> {
        const opened = await box();
        opened.ws.send(hello());
        expect(await opened.next()).toEqual({
            event: 'welcome',
            data: { arenaName: 'Arena 01' },
        });
        return opened;
    }

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
        const opened = await welcomedBox();
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
        const first = await welcomedBox();
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
        await opened.next();
        opened.ws.send(JSON.stringify({ event: 'dance', data: {} }));
        expect(await opened.next()).toEqual(errorOf('unknown_event'));
        expect(opened.ws.readyState).toBe(WebSocket.OPEN);
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
});
