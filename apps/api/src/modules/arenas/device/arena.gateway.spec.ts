import 'reflect-metadata';
import { EventEmitter } from 'node:events';
import type { WebSocket } from 'ws';
import type { ArenasService } from '../arenas.service.js';
import type { FightService } from '../../matches/fight/fight.service.js';
import { ArenaConnections } from './arena-connections.js';
import type { ArenaStatePusher } from './arena-state-pusher.js';
import { MAX_CONCURRENT_CHECKS } from './arena-protocol.js';
import { ArenaGateway } from './arena.gateway.js';

/** Enough of a ws socket for the gateway; close() emits 'close' at once */
class FakeClient extends EventEmitter {
    readyState = 1;
    closedWith: { code: number; reason: string } | null = null;
    send = vi.fn();
    ping = vi.fn();
    terminate = vi.fn();

    close(code: number, reason: string): void {
        if (this.readyState !== 1) {
            return;
        }
        this.closedWith = { code, reason };
        this.readyState = 3;
        this.emit('close');
    }

    sendHello(): void {
        const hello = {
            event: 'hello',
            data: { deviceId: 'dev-1', token: 'tok', protocol: 1 },
        };
        this.emit('message', Buffer.from(JSON.stringify(hello)), false);
    }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('ArenaGateway', () => {
    let gateway: ArenaGateway;
    let clients: FakeClient[];

    function connect(): FakeClient {
        const client = new FakeClient();
        clients.push(client);
        gateway.handleConnection(client as unknown as WebSocket);
        return client;
    }

    let authenticateDevice: ReturnType<typeof vi.fn>;
    let push: ReturnType<typeof vi.fn>;
    let surrender: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        clients = [];
        authenticateDevice = vi.fn((deviceId: string) =>
            Promise.resolve(
                deviceId === 'dev-1'
                    ? { id: 'arena-1', name: 'Arena 01' }
                    : null,
            ),
        );
        push = vi.fn(() => Promise.resolve());
        surrender = vi.fn(() => Promise.resolve('done'));
        gateway = new ArenaGateway(
            { authenticateDevice } as unknown as ArenasService,
            new ArenaConnections(),
            { push } as unknown as ArenaStatePusher,
            { surrender } as unknown as FightService,
        );
    });

    it('pushes state after welcome and hands surrenders to the fight service', async () => {
        const box = connect();
        box.sendHello();
        await flush();

        expect(push).toHaveBeenCalledWith('arena-1');

        const press = { event: 'surrender', data: { side: 'A', matchId: 'm' } };
        box.emit('message', Buffer.from(JSON.stringify(press)), false);
        await flush();

        expect(surrender).toHaveBeenCalledWith('arena-1', 'm', 'A');
    });

    afterEach(() => {
        // close() emits 'close', which stops each session's timers
        for (const client of clients) {
            client.close(1000, 'test_done');
        }
        vi.useRealTimers();
    });

    it('accepts any number of idle sockets', () => {
        const idle = Array.from({ length: 100 }, connect);

        expect(idle.every((client) => client.closedWith === null)).toBe(true);
    });

    it(`refuses a hello with 1013 while ${MAX_CONCURRENT_CHECKS} credential checks run`, async () => {
        authenticateDevice.mockReturnValue(new Promise(() => {}));
        const checking = Array.from({ length: MAX_CONCURRENT_CHECKS }, connect);
        checking.forEach((client) => client.sendHello());
        await flush();

        const extra = connect();
        extra.sendHello();
        await flush();

        expect(extra.closedWith).toEqual({ code: 1013, reason: 'server_busy' });
        expect(checking.every((client) => client.closedWith === null)).toBe(
            true,
        );
    });

    it('frees a check slot once the check finishes', async () => {
        const boxes = Array.from(
            { length: MAX_CONCURRENT_CHECKS + 1 },
            connect,
        );
        for (const box of boxes) {
            box.sendHello();
            await flush();
        }

        // each check finished before the next hello, so none was refused
        expect(boxes.some((box) => box.closedWith?.code === 1013)).toBe(false);
    });

    it('closes boxes with 1001 on shutdown', async () => {
        const box = connect();

        await gateway.beforeApplicationShutdown();

        expect(box.closedWith).toEqual({
            code: 1001,
            reason: 'server_shutdown',
        });
    });

    it('closes connections that arrive during shutdown with 1001', async () => {
        await gateway.beforeApplicationShutdown();

        const late = connect();

        expect(late.closedWith).toEqual({
            code: 1001,
            reason: 'server_shutdown',
        });
    });

    it('leaves no timer behind once every box closed on shutdown', async () => {
        vi.useFakeTimers();
        connect();

        await gateway.beforeApplicationShutdown();

        expect(vi.getTimerCount()).toBe(0);
    });
});
