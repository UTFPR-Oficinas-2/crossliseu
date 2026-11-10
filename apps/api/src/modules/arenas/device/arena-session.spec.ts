import type { Mock } from 'vitest';
import { ArenaConnections, type DeviceSocket } from './arena-connections.js';
import { ArenaSession, type ArenaSessionDeps } from './arena-session.js';
import type { AuthenticatedArena } from '../arenas.service.js';

class FakeSocket implements DeviceSocket {
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

const ARENA: AuthenticatedArena = { id: 'arena-1', name: 'Arena 01' };

function hello(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        event: 'hello',
        data: { deviceId: 'dev-1', token: 'tok', protocol: 1, ...overrides },
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

describe('ArenaSession', () => {
    let connections: ArenaConnections;
    let deps: {
        authenticate: Mock<ArenaSessionDeps['authenticate']>;
        connections: ArenaConnections;
        checks: { acquire: Mock<() => boolean>; release: Mock<() => void> };
        logger: { warn: Mock<() => void>; error: Mock<() => void> };
        pushState: Mock<ArenaSessionDeps['pushState']>;
        surrender: Mock<ArenaSessionDeps['surrender']>;
    };

    function open(): { socket: FakeSocket; session: ArenaSession } {
        const socket = new FakeSocket();
        return { socket, session: new ArenaSession(socket, deps) };
    }

    async function welcomed(): Promise<{
        socket: FakeSocket;
        session: ArenaSession;
    }> {
        const box = open();
        await box.session.onMessage(hello());
        box.socket.sent = [];
        return box;
    }

    beforeEach(() => {
        vi.useFakeTimers();
        connections = new ArenaConnections();
        deps = {
            authenticate: vi.fn<ArenaSessionDeps['authenticate']>(
                (deviceId, token) =>
                    Promise.resolve(
                        deviceId === 'dev-1' && token === 'tok' ? ARENA : null,
                    ),
            ),
            connections,
            checks: {
                acquire: vi.fn<() => boolean>(() => true),
                release: vi.fn<() => void>(),
            },
            logger: { warn: vi.fn<() => void>(), error: vi.fn<() => void>() },
            pushState: vi.fn<ArenaSessionDeps['pushState']>(() =>
                Promise.resolve(),
            ),
            surrender: vi.fn<ArenaSessionDeps['surrender']>(() =>
                Promise.resolve('done'),
            ),
        };
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('handshake', () => {
        it('welcomes a valid hello', async () => {
            const { socket, session } = open();

            await session.onMessage(hello());

            expect(socket.sent).toEqual([
                { event: 'welcome', data: { arenaName: 'Arena 01' } },
            ]);
            expect(socket.closed).toBeNull();
            expect(session.arenaId).toBe('arena-1');
            expect(connections.isOnline('arena-1')).toBe(true);
        });

        it('closes with 4002 when no hello arrives within 5 s', () => {
            const { socket } = open();

            vi.advanceTimersByTime(4_999);
            expect(socket.closed).toBeNull();

            vi.advanceTimersByTime(1);
            expect(socket.closed).toEqual({
                code: 4002,
                reason: 'hello_timeout',
            });
        });

        it('does not time out once hello arrived', async () => {
            const { socket, session } = open();
            vi.advanceTimersByTime(1_000);

            await session.onMessage(hello());
            session.onPong();
            vi.advanceTimersByTime(9_000);

            expect(socket.closed).toBeNull();
        });

        it('closes with 4001 for wrong credentials', async () => {
            const { socket, session } = open();

            await session.onMessage(hello({ token: 'nope' }));

            expect(socket.closed).toEqual({
                code: 4001,
                reason: 'bad_credentials',
            });
            expect(socket.sent).toEqual([]);
            expect(connections.isOnline('arena-1')).toBe(false);
        });

        it.each([
            ['no fields', {}],
            ['no protocol', { deviceId: 'dev-1', token: 'tok' }],
            [
                'a string protocol',
                { deviceId: 'dev-1', token: 'tok', protocol: '1' },
            ],
        ])('closes with 4001 for a malformed hello (%s)', async (_l, data) => {
            const { socket, session } = open();

            await session.onMessage(frame('hello', data));

            expect(socket.closed?.code).toBe(4001);
            expect(deps.authenticate).not.toHaveBeenCalled();
        });

        it('checks credentials before the version', async () => {
            const { socket, session } = open();

            await session.onMessage(hello({ token: 'nope', protocol: 2 }));

            expect(socket.closed?.code).toBe(4001);
        });

        it('closes with 4004 for an unsupported protocol', async () => {
            const { socket, session } = open();

            await session.onMessage(hello({ protocol: 2 }));

            expect(socket.closed).toEqual({
                code: 4004,
                reason: 'unsupported_protocol',
            });
            expect(connections.isOnline('arena-1')).toBe(false);
        });

        it('replaces an older socket after the new one passed', async () => {
            const a = await welcomed();
            const b = open();

            await b.session.onMessage(hello());

            expect(a.socket.closed).toEqual({ code: 4003, reason: 'replaced' });
            expect(b.socket.sent).toEqual([
                { event: 'welcome', data: { arenaName: 'Arena 01' } },
            ]);
            a.session.onClose();
            expect(connections.isOnline('arena-1')).toBe(true);
            b.session.onClose();
            expect(connections.isOnline('arena-1')).toBe(false);
        });

        it('does not replace on a failed login', async () => {
            const a = await welcomed();
            const b = open();

            await b.session.onMessage(hello({ token: 'nope' }));

            expect(a.socket.closed).toBeNull();
            expect(b.socket.closed?.code).toBe(4001);
            expect(connections.isOnline('arena-1')).toBe(true);
        });

        it('does nothing after a close that lands during the credential check', async () => {
            const a = await welcomed();
            const check = deferred<AuthenticatedArena | null>();
            deps.authenticate.mockReturnValueOnce(check.promise);
            const b = open();

            const handled = b.session.onMessage(hello());
            b.session.onClose();
            check.resolve(ARENA);
            await handled;

            expect(b.socket.sent).toEqual([]);
            expect(b.socket.closed).toBeNull();
            expect(a.socket.closed).toBeNull();
            // A still holds the arena: B never claimed it
            a.session.onClose();
            expect(connections.isOnline('arena-1')).toBe(false);
        });

        it('does nothing when the socket starts closing during the credential check', async () => {
            const a = await welcomed();
            const check = deferred<AuthenticatedArena | null>();
            deps.authenticate.mockReturnValueOnce(check.promise);
            const b = open();

            const handled = b.session.onMessage(hello());
            // the peer sent a close frame; ws's 'close' event (onClose) comes later
            b.socket.readyState = 2;
            check.resolve(ARENA);
            await handled;

            expect(b.socket.sent).toEqual([]);
            expect(a.socket.closed).toBeNull();
            // A still holds the arena: B never claimed it
            a.session.onClose();
            expect(connections.isOnline('arena-1')).toBe(false);
        });

        it('ignores frames on a socket that is closing', async () => {
            const { socket, session } = await welcomed();
            socket.readyState = 2;

            await session.onMessage(hello());
            await session.onMessage('not json');

            expect(socket.sent).toEqual([]);
        });

        it('refuses a login whose credentials were revoked during the check', async () => {
            const check = deferred<AuthenticatedArena | null>();
            deps.authenticate.mockReturnValueOnce(check.promise);
            const { socket, session } = open();

            const handled = session.onMessage(hello());
            // the operator rotates the token (or deletes the arena) while bcrypt runs
            connections.drop('arena-1', 4001, 'bad_credentials');
            check.resolve(ARENA);
            await handled;

            expect(socket.closed).toEqual({
                code: 4001,
                reason: 'bad_credentials',
            });
            expect(socket.sent).toEqual([]);
            expect(connections.isOnline('arena-1')).toBe(false);
        });

        it('closes with 1011 when the credential check takes longer than 5 s', async () => {
            deps.authenticate.mockReturnValueOnce(new Promise(() => {}));
            const { socket, session } = open();

            const handled = session.onMessage(hello());
            await vi.advanceTimersByTimeAsync(4_999);
            expect(socket.closed).toBeNull();
            await vi.advanceTimersByTimeAsync(1);
            await handled;

            expect(socket.closed).toEqual({
                code: 1011,
                reason: 'internal_error',
            });
            expect(connections.isOnline('arena-1')).toBe(false);
        });

        it('ignores a credential check that finishes after the timeout', async () => {
            const check = deferred<AuthenticatedArena | null>();
            deps.authenticate.mockReturnValueOnce(check.promise);
            const { socket, session } = open();

            const handled = session.onMessage(hello());
            await vi.advanceTimersByTimeAsync(5_000);
            await handled;
            check.resolve(ARENA);
            await Promise.resolve();

            expect(socket.sent).toEqual([]);
            expect(connections.isOnline('arena-1')).toBe(false);
        });

        it('only warns when the credential check fails after the socket closed', async () => {
            const check = deferred<AuthenticatedArena | null>();
            deps.authenticate.mockReturnValueOnce(
                check.promise.then(() => Promise.reject(new Error('db gone'))),
            );
            const { socket, session } = open();

            const handled = session.onMessage(hello());
            session.onClose();
            check.resolve(null);
            await handled;

            expect(deps.logger.error).not.toHaveBeenCalled();
            expect(deps.logger.warn).toHaveBeenCalled();
            expect(socket.closed).toBeNull();
        });

        it('closes with 1013 when no credential check slot is free', async () => {
            deps.checks.acquire.mockReturnValueOnce(false);
            const { socket, session } = open();

            await session.onMessage(hello());

            expect(socket.closed).toEqual({
                code: 1013,
                reason: 'server_busy',
            });
            expect(deps.authenticate).not.toHaveBeenCalled();
            expect(deps.checks.release).not.toHaveBeenCalled();
        });

        it.each([
            ['succeeds', () => Promise.resolve(ARENA)],
            ['fails', () => Promise.resolve(null)],
            ['throws', () => Promise.reject(new Error('db down'))],
        ])('releases the check slot when the check %s', async (_l, result) => {
            deps.authenticate.mockImplementationOnce(result);
            const { session } = open();

            await session.onMessage(hello());

            expect(deps.checks.acquire).toHaveBeenCalledTimes(1);
            expect(deps.checks.release).toHaveBeenCalledTimes(1);
        });

        it('keeps the check slot until a timed-out check really settles', async () => {
            const check = deferred<AuthenticatedArena | null>();
            deps.authenticate.mockReturnValueOnce(check.promise);
            const { socket, session } = open();

            const handled = session.onMessage(hello());
            await vi.advanceTimersByTimeAsync(5_000);
            await handled;
            expect(socket.closed?.code).toBe(1011);
            // bcrypt / the query is still running: the slot stays taken
            expect(deps.checks.release).not.toHaveBeenCalled();

            check.resolve(ARENA);
            await vi.advanceTimersByTimeAsync(0);
            expect(deps.checks.release).toHaveBeenCalledTimes(1);
        });

        it('releases the check slot once when the socket closes mid-check', async () => {
            const check = deferred<AuthenticatedArena | null>();
            deps.authenticate.mockReturnValueOnce(check.promise);
            const { session } = open();

            const handled = session.onMessage(hello());
            session.onClose();
            check.resolve(ARENA);
            await handled;
            await vi.advanceTimersByTimeAsync(10_000);

            expect(deps.checks.release).toHaveBeenCalledTimes(1);
        });

        it('closes with 1011 when the credential check throws', async () => {
            deps.authenticate.mockRejectedValueOnce(new Error('db down'));
            const { socket, session } = open();

            await expect(session.onMessage(hello())).resolves.toBeUndefined();

            expect(socket.closed?.code).toBe(1011);
            expect(deps.logger.error).toHaveBeenCalled();
            expect(connections.isOnline('arena-1')).toBe(false);
        });
    });

    describe('errors', () => {
        it('answers a binary frame with bad_frame', async () => {
            const { socket, session } = open();

            await session.onMessage(null);

            expect(socket.sent).toEqual([errorOf('bad_frame')]);
            expect(socket.closed).toBeNull();
        });

        it('answers invalid JSON with bad_frame before welcome', async () => {
            const { socket, session } = open();

            await session.onMessage('not json');

            expect(socket.sent).toEqual([errorOf('bad_frame')]);
            expect(socket.closed).toBeNull();
        });

        it('answers invalid JSON with bad_frame after welcome', async () => {
            const { socket, session } = await welcomed();

            await session.onMessage('{"data":{}}');

            expect(socket.sent).toEqual([errorOf('bad_frame')]);
            expect(socket.closed).toBeNull();
        });

        it('answers non-hello events before welcome with not_authenticated', async () => {
            const { socket, session } = open();

            await session.onMessage(frame('surrender', { side: 'A' }));
            await session.onMessage(frame('dance'));
            await session.onMessage(hello());

            expect(socket.sent).toEqual([
                errorOf('not_authenticated'),
                errorOf('not_authenticated'),
                { event: 'welcome', data: { arenaName: 'Arena 01' } },
            ]);
        });

        it('answers a hello sent while the first is being checked with not_authenticated', async () => {
            const check = deferred<AuthenticatedArena | null>();
            deps.authenticate.mockReturnValueOnce(check.promise);
            const { socket, session } = open();

            const first = session.onMessage(hello());
            await session.onMessage(hello());
            check.resolve(ARENA);
            await first;

            expect(socket.sent).toEqual([
                errorOf('not_authenticated'),
                { event: 'welcome', data: { arenaName: 'Arena 01' } },
            ]);
            expect(deps.authenticate).toHaveBeenCalledTimes(1);
        });

        it('answers a second hello after welcome with already_authenticated', async () => {
            const { socket, session } = await welcomed();

            await session.onMessage(hello());

            expect(socket.sent).toEqual([errorOf('already_authenticated')]);
            expect(deps.authenticate).toHaveBeenCalledTimes(1);
            expect(socket.closed).toBeNull();
            expect(connections.isOnline('arena-1')).toBe(true);
        });

        it('answers other events after welcome with unknown_event', async () => {
            const { socket, session } = await welcomed();

            await session.onMessage(frame('dance'));
            await session.onMessage(frame('state'));

            expect(socket.sent).toEqual([
                errorOf('unknown_event'),
                errorOf('unknown_event'),
            ]);
        });
    });

    describe('state', () => {
        it('pushes state right after welcome', async () => {
            const { socket, session } = open();
            deps.pushState.mockImplementationOnce(() => {
                // welcome is already out when the push starts
                expect(socket.sent).toEqual([
                    { event: 'welcome', data: { arenaName: 'Arena 01' } },
                ]);
                return Promise.resolve();
            });

            await session.onMessage(hello());

            expect(deps.pushState).toHaveBeenCalledTimes(1);
            expect(deps.pushState).toHaveBeenCalledWith('arena-1');
        });

        it('does not push state for a refused login', async () => {
            const { session } = open();

            await session.onMessage(hello({ token: 'nope' }));

            expect(deps.pushState).not.toHaveBeenCalled();
        });
    });

    describe('surrender', () => {
        it('surrender done sends nothing back', async () => {
            const { socket, session } = await welcomed();

            await session.onMessage(
                frame('surrender', { side: 'B', matchId: 'm-1' }),
            );

            expect(deps.surrender).toHaveBeenCalledWith('arena-1', 'm-1', 'B');
            expect(socket.sent).toEqual([]);
        });

        it('passes a null matchId through', async () => {
            const { session } = await welcomed();

            await session.onMessage(
                frame('surrender', { side: 'A', matchId: null }),
            );

            expect(deps.surrender).toHaveBeenCalledWith('arena-1', null, 'A');
        });

        it.each([
            ['not_current_match', "Not this arena's current match"],
            ['not_ongoing', 'Match is not ongoing'],
        ] as const)(
            'surrender rejected (%s) answers surrender_rejected',
            async (result, message) => {
                deps.surrender.mockResolvedValueOnce(result);
                const { socket, session } = await welcomed();

                await session.onMessage(
                    frame('surrender', { side: 'A', matchId: 'm-1' }),
                );

                expect(socket.sent).toEqual([
                    {
                        event: 'error',
                        data: { code: 'surrender_rejected', message },
                    },
                ]);
            },
        );

        it.each([
            ['no data', undefined],
            ['no matchId', { side: 'A' }],
            ['a bad side', { side: 'C', matchId: 'm-1' }],
            ['a numeric matchId', { side: 'A', matchId: 3 }],
        ])(
            'malformed surrender (%s) answers invalid_data and does not call deps.surrender',
            async (_l, data) => {
                const { socket, session } = await welcomed();

                await session.onMessage(frame('surrender', data));

                expect(socket.sent).toEqual([
                    {
                        event: 'error',
                        data: {
                            code: 'invalid_data',
                            message: 'Expected side A or B and a matchId',
                        },
                    },
                ]);
                expect(deps.surrender).not.toHaveBeenCalled();
            },
        );

        it('surrender before welcome answers not_authenticated', async () => {
            const { socket, session } = open();

            await session.onMessage(
                frame('surrender', { side: 'A', matchId: 'm-1' }),
            );

            expect(socket.sent).toEqual([errorOf('not_authenticated')]);
            expect(deps.surrender).not.toHaveBeenCalled();
        });

        it('a throwing deps.surrender answers surrender_rejected and logs error', async () => {
            deps.surrender.mockRejectedValueOnce(new Error('db down'));
            const { socket, session } = await welcomed();

            await expect(
                session.onMessage(
                    frame('surrender', { side: 'A', matchId: 'm-1' }),
                ),
            ).resolves.toBeUndefined();

            expect(socket.sent).toEqual([
                {
                    event: 'error',
                    data: {
                        code: 'surrender_rejected',
                        message: 'Could not check the surrender',
                    },
                },
            ]);
            expect(deps.logger.error).toHaveBeenCalledWith(
                'surrender_failed',
                expect.objectContaining({
                    arenaId: 'arena-1',
                    message: 'db down',
                }),
            );
        });

        it('sends no reply when the socket closed during the surrender check', async () => {
            const { socket, session } = await welcomed();
            deps.surrender.mockImplementationOnce(() => {
                socket.readyState = 2;
                return Promise.resolve('not_ongoing');
            });

            await session.onMessage(
                frame('surrender', { side: 'A', matchId: 'm-1' }),
            );

            expect(socket.sent).toEqual([]);
        });
    });

    describe('heartbeat', () => {
        it('pings every 10 s', async () => {
            const { socket, session } = await welcomed();

            vi.advanceTimersByTime(10_000);
            expect(socket.pings).toBe(1);
            session.onPong();
            vi.advanceTimersByTime(10_000);
            expect(socket.pings).toBe(2);
            expect(socket.terminated).toBe(false);
        });

        it('terminates a socket that missed a pong', async () => {
            const { socket } = await welcomed();

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
