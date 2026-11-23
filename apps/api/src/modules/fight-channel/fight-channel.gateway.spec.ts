import 'reflect-metadata';
import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import type { WebSocket } from 'ws';
import type { FightAccessRegistry } from './fight-access.js';
import {
    FIGHT_AUTH_TIMEOUT_MS,
    MAX_CONCURRENT_CHECKS,
} from './fight-channel-protocol.js';
import { FightChannelGateway } from './fight-channel.gateway.js';
import { FightConnections } from './fight-connections.js';
import type { FightStatePusher } from './fight-state-pusher.js';

const MATCH_ID = '5b8e2f0a-3c1d-4e6f-9a7b-1c2d3e4f5a6b';

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

    sendAuth(token = 'good', matchId = MATCH_ID): void {
        const auth = { event: 'auth', data: { matchId, token } };
        this.emit('message', Buffer.from(JSON.stringify(auth)), false);
    }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('FightChannelGateway', () => {
    let gateway: FightChannelGateway;
    let connections: FightConnections;
    let clients: FakeClient[];
    let verify: ReturnType<typeof vi.fn>;
    let sendSnapshot: ReturnType<typeof vi.fn>;

    function connect(): FakeClient {
        const client = new FakeClient();
        clients.push(client);
        gateway.handleConnection(client as unknown as WebSocket);
        return client;
    }

    const subscribed = (client: FakeClient) =>
        connections
            .subscribers(MATCH_ID)
            .some(({ socket }) => (socket as unknown) === client);

    beforeEach(() => {
        // The session logs refused and failed checks; keep the test output clean
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
        clients = [];
        connections = new FightConnections();
        verify = vi.fn((credential: { token: string }) =>
            Promise.resolve(
                credential.token === 'good'
                    ? { role: 'operator', userId: 'u-1' }
                    : null,
            ),
        );
        sendSnapshot = vi.fn(
            (_matchId: string, _role: string, socket: FakeClient) => {
                socket.send(JSON.stringify({ event: 'state', data: {} }));
                return Promise.resolve(true);
            },
        );
        gateway = new FightChannelGateway(
            { verify } as unknown as FightAccessRegistry,
            connections,
            { sendSnapshot } as unknown as FightStatePusher,
        );
    });

    afterEach(() => {
        // close() emits 'close', which stops each session's timers
        for (const client of clients) {
            client.close(1000, 'test_done');
        }
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('subscribes a valid auth and sends it the first state', async () => {
        const client = connect();
        client.sendAuth();
        await flush();

        expect(sendSnapshot).toHaveBeenCalledWith(MATCH_ID, 'operator', client);
        expect(JSON.parse(client.send.mock.calls[0][0] as string).event).toBe(
            'state',
        );
        expect(subscribed(client)).toBe(true);
        expect(client.closedWith).toBeNull();
    });

    it('registers the socket before the snapshot is read', async () => {
        let wasSubscribed = false;
        sendSnapshot.mockImplementation(
            (_m: string, _r: string, socket: FakeClient) => {
                wasSubscribed = subscribed(socket);
                return Promise.resolve(true);
            },
        );
        const client = connect();
        client.sendAuth();
        await flush();

        expect(wasSubscribed).toBe(true);
    });

    it('closes a bad token with 4001', async () => {
        const client = connect();
        client.sendAuth('bad');
        await flush();

        expect(client.closedWith).toEqual({
            code: 4001,
            reason: 'bad_credentials',
        });
    });

    it('closes with 4002 when no frame arrives in time', () => {
        vi.useFakeTimers();
        const client = connect();

        vi.advanceTimersByTime(FIGHT_AUTH_TIMEOUT_MS);

        expect(client.closedWith).toEqual({
            code: 4002,
            reason: 'auth_timeout',
        });
    });

    it('removes the socket from the connections when it closes', async () => {
        const client = connect();
        client.sendAuth();
        await flush();
        expect(subscribed(client)).toBe(true);

        client.close(1000, 'bye');

        expect(subscribed(client)).toBe(false);
        expect(connections.hasSubscribers(MATCH_ID)).toBe(false);
    });

    it('leaves a match that does not exist out of the connections after 4005', async () => {
        sendSnapshot.mockResolvedValue(false);
        const client = connect();
        client.sendAuth();
        await flush();

        expect(client.closedWith).toEqual({
            code: 4005,
            reason: 'match_not_found',
        });
        expect(connections.hasSubscribers(MATCH_ID)).toBe(false);
    });

    it('forgets the socket when the snapshot throws', async () => {
        sendSnapshot.mockRejectedValue(new Error('db down'));
        const client = connect();
        client.sendAuth();
        await flush();

        expect(client.closedWith?.code).toBe(1011);
        expect(connections.hasSubscribers(MATCH_ID)).toBe(false);
    });

    it(`refuses an auth with 1013 while ${MAX_CONCURRENT_CHECKS} credential checks run`, async () => {
        verify.mockReturnValue(new Promise(() => {}));
        const checking = Array.from({ length: MAX_CONCURRENT_CHECKS }, connect);
        checking.forEach((client) => client.sendAuth());
        await flush();

        const extra = connect();
        extra.sendAuth();
        await flush();

        expect(extra.closedWith).toEqual({ code: 1013, reason: 'server_busy' });
        expect(checking.every((client) => client.closedWith === null)).toBe(
            true,
        );
    });

    it('closes every socket with 1001 on shutdown', async () => {
        const watcher = connect();
        watcher.sendAuth();
        await flush();
        const idle = connect();

        await gateway.beforeApplicationShutdown();

        for (const client of [watcher, idle]) {
            expect(client.closedWith).toEqual({
                code: 1001,
                reason: 'server_shutdown',
            });
        }
    });

    it('closes connections that arrive during shutdown with 1001', async () => {
        await gateway.beforeApplicationShutdown();

        const late = connect();

        expect(late.closedWith).toEqual({
            code: 1001,
            reason: 'server_shutdown',
        });
    });
});
