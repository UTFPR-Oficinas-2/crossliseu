import type { Mock } from 'vitest';
import type { FightAccess } from './fight-access.js';
import {
    FightSession,
    type FightSessionDeps,
    type FightSocket,
} from './fight-session.js';

const MATCH_ID = '3f1c2b0e-6d2a-4c53-9a39-0f7a8d1b2c4e';
const OPERATOR: FightAccess = { role: 'operator', userId: 'user-1' };

class FakeSocket implements FightSocket {
    /** ws readyState: 1 OPEN, 2 CLOSING, 3 CLOSED */
    readyState = 1;
    sent: unknown[] = [];
    closed: { code: number; reason: string } | null = null;
    pings = 0;
    terminated = false;

    send(text: string): void {
        this.sent.push(JSON.parse(text));
    }
    close(code: number, reason: string): void {
        this.closed = { code, reason };
    }
    ping(): void {
        this.pings++;
    }
    terminate(): void {
        this.terminated = true;
    }
}

function auth(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        event: 'auth',
        data: { matchId: MATCH_ID, token: 'tok', ...overrides },
    });
}

function frame(event: string, data: unknown = {}): string {
    return JSON.stringify({ event, data });
}

function errorOf(code: string) {
    return { event: 'error', data: { code, message: expect.any(String) } };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

describe('FightSession', () => {
    let deps: {
        verify: Mock<FightSessionDeps['verify']>;
        checks: { acquire: Mock<() => boolean>; release: Mock<() => void> };
        logger: { warn: Mock<() => void>; error: Mock<() => void> };
        subscribe: Mock<FightSessionDeps['subscribe']>;
    };

    function open(): { socket: FakeSocket; session: FightSession } {
        const socket = new FakeSocket();
        return { socket, session: new FightSession(socket, deps) };
    }

    async function subscribed(): Promise<{
        socket: FakeSocket;
        session: FightSession;
    }> {
        const fight = open();
        await fight.session.onMessage(auth());
        fight.socket.sent = [];
        return fight;
    }

    beforeEach(() => {
        vi.useFakeTimers();
        deps = {
            verify: vi.fn<FightSessionDeps['verify']>(() =>
                Promise.resolve(OPERATOR),
            ),
            checks: {
                acquire: vi.fn<() => boolean>(() => true),
                release: vi.fn<() => void>(),
            },
            logger: { warn: vi.fn<() => void>(), error: vi.fn<() => void>() },
            subscribe: vi.fn<FightSessionDeps['subscribe']>(() =>
                Promise.resolve(true),
            ),
        };
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('handshake', () => {
        it('subscribes a valid auth', async () => {
            const { socket, session } = open();

            await session.onMessage(auth({ name: 'Ref' }));

            expect(deps.verify).toHaveBeenCalledWith({
                matchId: MATCH_ID,
                token: 'tok',
                name: 'Ref',
            });
            expect(deps.subscribe).toHaveBeenCalledTimes(1);
            expect(deps.subscribe).toHaveBeenCalledWith(
                MATCH_ID,
                { role: 'operator', userId: expect.any(String) },
                socket,
            );
            expect(socket.sent).toEqual([]);
            expect(socket.closed).toBeNull();
            expect(session.matchId).toBe(MATCH_ID);
        });

        it('has no matchId before auth', () => {
            expect(open().session.matchId).toBeNull();
        });

        it('closes with 4002 when no auth arrives within 5 s', () => {
            const { socket } = open();

            vi.advanceTimersByTime(4_999);
            expect(socket.closed).toBeNull();

            vi.advanceTimersByTime(1);
            expect(socket.closed).toEqual({
                code: 4002,
                reason: 'auth_timeout',
            });
        });

        it('does not time out once auth arrived', async () => {
            const { socket, session } = open();
            vi.advanceTimersByTime(1_000);

            await session.onMessage(auth());
            session.onPong();
            vi.advanceTimersByTime(9_000);

            expect(socket.closed).toBeNull();
        });

        it('closes with 4001 when the verifier returns null', async () => {
            deps.verify.mockResolvedValueOnce(null);
            const { socket, session } = open();

            await session.onMessage(auth());

            expect(socket.closed).toEqual({
                code: 4001,
                reason: 'bad_credentials',
            });
            expect(deps.subscribe).not.toHaveBeenCalled();
        });

        it('closes with 4001 for a malformed credential', async () => {
            const { socket, session } = open();

            await session.onMessage(frame('auth', { matchId: MATCH_ID }));

            expect(socket.closed).toEqual({
                code: 4001,
                reason: 'bad_credentials',
            });
            expect(deps.verify).not.toHaveBeenCalled();
        });

        it('closes with 4005 for a matchId that is not a UUID, without verifying', async () => {
            const { socket, session } = open();

            await session.onMessage(auth({ matchId: 'nope' }));

            expect(socket.closed).toEqual({
                code: 4005,
                reason: 'match_not_found',
            });
            expect(deps.verify).not.toHaveBeenCalled();
            expect(deps.subscribe).not.toHaveBeenCalled();
        });

        it('closes with 4005 when subscribe says the match does not exist', async () => {
            deps.subscribe.mockResolvedValueOnce(false);
            const { socket, session } = open();

            await session.onMessage(auth());

            expect(socket.closed).toEqual({
                code: 4005,
                reason: 'match_not_found',
            });
        });

        it('closes with 1011 and logs when subscribe rejects', async () => {
            deps.subscribe.mockRejectedValueOnce(new Error('db down'));
            const { socket, session } = open();

            await session.onMessage(auth());

            expect(socket.closed).toEqual({
                code: 1011,
                reason: 'internal_error',
            });
            expect(deps.logger.error).toHaveBeenCalled();
        });

        it('closes with 1011 when subscribe does not settle within 5 s', async () => {
            deps.subscribe.mockReturnValueOnce(new Promise(() => {}));
            const { socket, session } = open();

            const handled = session.onMessage(auth());
            await vi.advanceTimersByTimeAsync(4_999);
            expect(socket.closed).toBeNull();
            await vi.advanceTimersByTimeAsync(1);
            await handled;

            expect(socket.closed).toEqual({
                code: 1011,
                reason: 'internal_error',
            });
        });

        it('closes with 1011 and logs when the verifier throws', async () => {
            deps.verify.mockRejectedValueOnce(new Error('db down'));
            const { socket, session } = open();

            await expect(session.onMessage(auth())).resolves.toBeUndefined();

            expect(socket.closed?.code).toBe(1011);
            expect(deps.logger.error).toHaveBeenCalled();
            expect(deps.subscribe).not.toHaveBeenCalled();
        });

        it('closes with 1011 when the verifier takes longer than 5 s', async () => {
            deps.verify.mockReturnValueOnce(new Promise(() => {}));
            const { socket, session } = open();

            const handled = session.onMessage(auth());
            await vi.advanceTimersByTimeAsync(5_000);
            await handled;

            expect(socket.closed?.code).toBe(1011);
            expect(deps.subscribe).not.toHaveBeenCalled();
        });

        it('closes with 1013 when no check slot is free', async () => {
            deps.checks.acquire.mockReturnValueOnce(false);
            const { socket, session } = open();

            await session.onMessage(auth());

            expect(socket.closed).toEqual({
                code: 1013,
                reason: 'server_busy',
            });
            expect(deps.verify).not.toHaveBeenCalled();
            expect(deps.checks.release).not.toHaveBeenCalled();
        });

        it.each([
            ['succeeds', () => Promise.resolve(OPERATOR)],
            ['returns null', () => Promise.resolve(null)],
            ['throws', () => Promise.reject(new Error('db down'))],
        ])('releases the check slot when the check %s', async (_l, result) => {
            deps.verify.mockImplementationOnce(result);
            const { session } = open();

            await session.onMessage(auth());

            expect(deps.checks.acquire).toHaveBeenCalledTimes(1);
            expect(deps.checks.release).toHaveBeenCalledTimes(1);
        });

        it('keeps the check slot until a timed-out check really settles', async () => {
            const check = deferred<FightAccess | null>();
            deps.verify.mockReturnValueOnce(check.promise);
            const { socket, session } = open();

            const handled = session.onMessage(auth());
            await vi.advanceTimersByTimeAsync(5_000);
            await handled;
            expect(socket.closed?.code).toBe(1011);
            expect(deps.checks.release).not.toHaveBeenCalled();

            check.resolve(OPERATOR);
            await vi.advanceTimersByTimeAsync(0);
            expect(deps.checks.release).toHaveBeenCalledTimes(1);
        });

        it('does nothing after a close that lands during the check', async () => {
            const check = deferred<FightAccess | null>();
            deps.verify.mockReturnValueOnce(check.promise);
            const { socket, session } = open();

            const handled = session.onMessage(auth());
            session.onClose();
            check.resolve(OPERATOR);
            await handled;

            expect(socket.sent).toEqual([]);
            expect(socket.closed).toBeNull();
            expect(deps.subscribe).not.toHaveBeenCalled();
        });

        it('does nothing when the socket starts closing during the check', async () => {
            const check = deferred<FightAccess | null>();
            deps.verify.mockReturnValueOnce(check.promise);
            const { socket, session } = open();

            const handled = session.onMessage(auth());
            socket.readyState = 2;
            check.resolve(OPERATOR);
            await handled;

            expect(deps.subscribe).not.toHaveBeenCalled();
            expect(socket.closed).toBeNull();
        });
    });

    describe('errors', () => {
        it('answers a binary frame with bad_frame and stays open', async () => {
            const { socket, session } = open();

            await session.onMessage(null);

            expect(socket.sent).toEqual([errorOf('bad_frame')]);
            expect(socket.closed).toBeNull();
        });

        it('answers invalid JSON with bad_frame before and after auth', async () => {
            const before = open();
            await before.session.onMessage('not json');
            const after = await subscribed();
            await after.session.onMessage('{"data":{}}');

            expect(before.socket.sent).toEqual([errorOf('bad_frame')]);
            expect(after.socket.sent).toEqual([errorOf('bad_frame')]);
            expect(before.socket.closed).toBeNull();
            expect(after.socket.closed).toBeNull();
        });

        it('answers other events before auth with not_authenticated', async () => {
            const { socket, session } = open();

            await session.onMessage(frame('dance'));
            await session.onMessage(frame('ping', null));

            expect(socket.sent).toEqual([
                errorOf('not_authenticated'),
                errorOf('not_authenticated'),
            ]);
            expect(socket.closed).toBeNull();
        });

        it('answers an auth sent while the first is being checked with already_authenticated', async () => {
            const check = deferred<FightAccess | null>();
            deps.verify.mockReturnValueOnce(check.promise);
            const { socket, session } = open();

            const first = session.onMessage(auth());
            await session.onMessage(auth());
            check.resolve(OPERATOR);
            await first;

            expect(socket.sent).toEqual([errorOf('already_authenticated')]);
            expect(deps.verify).toHaveBeenCalledTimes(1);
            expect(deps.subscribe).toHaveBeenCalledTimes(1);
        });

        it('answers a second auth after login with already_authenticated', async () => {
            const { socket, session } = await subscribed();

            await session.onMessage(auth());

            expect(socket.sent).toEqual([errorOf('already_authenticated')]);
            expect(deps.verify).toHaveBeenCalledTimes(1);
            expect(deps.subscribe).toHaveBeenCalledTimes(1);
            expect(socket.closed).toBeNull();
        });

        it('answers other events after login with unknown_event', async () => {
            const { socket, session } = await subscribed();

            await session.onMessage(frame('dance'));
            await session.onMessage(frame('state'));

            expect(socket.sent).toEqual([
                errorOf('unknown_event'),
                errorOf('unknown_event'),
            ]);
        });

        it('ignores frames on a socket that is closing', async () => {
            const { socket, session } = await subscribed();
            socket.readyState = 2;

            await session.onMessage(auth());
            await session.onMessage('not json');

            expect(socket.sent).toEqual([]);
        });
    });

    describe('heartbeat', () => {
        it('pings every 10 s', async () => {
            const { socket, session } = await subscribed();

            vi.advanceTimersByTime(10_000);
            expect(socket.pings).toBe(1);
            session.onPong();
            vi.advanceTimersByTime(10_000);
            expect(socket.pings).toBe(2);
            expect(socket.terminated).toBe(false);
        });

        it('sends an app-level ping each tick once subscribed', async () => {
            const { socket, session } = await subscribed();

            vi.advanceTimersByTime(10_000);
            session.onPong();
            vi.advanceTimersByTime(10_000);

            expect(socket.sent).toEqual([
                { event: 'ping', data: null },
                { event: 'ping', data: null },
            ]);
        });

        it('terminates a socket that missed a pong', async () => {
            const { socket } = await subscribed();

            vi.advanceTimersByTime(10_000);
            expect(socket.terminated).toBe(false);
            vi.advanceTimersByTime(10_000);
            expect(socket.terminated).toBe(true);
        });

        it('onClose stops the timers', () => {
            const { socket, session } = open();

            session.onClose();
            vi.advanceTimersByTime(60_000);

            expect(socket.pings).toBe(0);
            expect(socket.closed).toBeNull();
        });
    });
});
