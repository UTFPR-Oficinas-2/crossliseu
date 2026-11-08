import type { Logger } from '@nestjs/common';
import type { AuthenticatedArena } from '../arenas.service.js';
import {
    SOCKET_OPEN,
    type ArenaConnections,
    type DeviceSocket,
} from './arena-connections.js';
import {
    CHECK_TIMEOUT_MS,
    CloseCode,
    errorFrame,
    HELLO_TIMEOUT_MS,
    parseFrame,
    parseHello,
    PING_INTERVAL_MS,
    PROTOCOL_VERSION,
    welcomeFrame,
} from './arena-protocol.js';

export type ArenaSessionDeps = {
    authenticate(
        deviceId: string,
        token: string,
    ): Promise<AuthenticatedArena | null>;
    connections: ArenaConnections;
    /** Slots for running credential checks; acquire() is false when all are taken */
    checks: { acquire(): boolean; release(): void };
    logger: Pick<Logger, 'warn' | 'error'>;
};

type State = 'awaiting_hello' | 'checking' | 'authenticated' | 'closed';

/**
 * One box socket on /arena: the handshake, the error replies and the heartbeat
 * (docs/arena-protocol.md). Knows nothing about ws or Nest, so it runs on a fake socket in tests.
 */
export class ArenaSession {
    private state: State = 'awaiting_hello';
    private alive = true;
    private helloTimer: ReturnType<typeof setTimeout> | undefined;
    private checkTimer: ReturnType<typeof setTimeout> | undefined;
    private readonly heartbeat: ReturnType<typeof setInterval>;
    private arena: AuthenticatedArena | null = null;

    /** Starts the hello timer and the heartbeat */
    constructor(
        private readonly socket: DeviceSocket,
        private readonly deps: ArenaSessionDeps,
    ) {
        this.helloTimer = setTimeout(
            () => this.close(CloseCode.HelloTimeout, 'hello_timeout'),
            HELLO_TIMEOUT_MS,
        );
        // A box that missed the previous ping by the next tick is gone
        this.heartbeat = setInterval(() => {
            if (!this.alive) {
                this.socket.terminate();
                return;
            }
            this.alive = false;
            this.socket.ping();
        }, PING_INTERVAL_MS);
    }

    /** The arena this socket logged in as; null before welcome */
    get arenaId(): string | null {
        return this.arena?.id ?? null;
    }

    /** `text` is null for a binary frame; resolves once the frame is fully handled, never rejects */
    async onMessage(text: string | null): Promise<void> {
        if (this.isClosed()) {
            return;
        }
        const frame = text === null ? null : parseFrame(text);
        if (!frame) {
            this.sendError(
                'bad_frame',
                'Expected a JSON text frame with an "event"',
            );
            return;
        }

        if (this.state === 'authenticated') {
            if (frame.event === 'hello') {
                this.sendError('already_authenticated', 'Already logged in');
            } else {
                this.sendError(
                    'unknown_event',
                    `Unknown event "${frame.event}"`,
                );
            }
            return;
        }

        if (frame.event !== 'hello' || this.state === 'checking') {
            this.sendError('not_authenticated', 'Send hello first');
            return;
        }

        await this.login(frame.data);
    }

    onPong(): void {
        this.alive = true;
    }

    /** The socket closed (any cause): stop timers, release the arena if this socket holds it */
    onClose(): void {
        this.state = 'closed';
        this.stopTimers();
        if (this.arena) {
            this.deps.connections.release(this.arena.id, this.socket);
        }
    }

    private async login(data: unknown): Promise<void> {
        clearTimeout(this.helloTimer);
        this.helloTimer = undefined;

        const hello = parseHello(data);
        if (!hello) {
            this.close(CloseCode.BadCredentials, 'bad_credentials');
            return;
        }

        if (!this.deps.checks.acquire()) {
            this.deps.logger.warn('device_checks_busy', {
                deviceId: hello.deviceId,
            });
            this.close(CloseCode.ServerBusy, 'server_busy');
            return;
        }
        this.state = 'checking';
        const revision = this.deps.connections.revision();
        let arena: AuthenticatedArena | null;
        try {
            arena = await this.withCheckTimeout(
                this.deps.authenticate(hello.deviceId, hello.token),
            );
        } catch (error) {
            const details = {
                deviceId: hello.deviceId,
                message: error instanceof Error ? error.message : String(error),
            };
            // Already gone (e.g. the app is shutting down): nothing to tell the box
            if (this.isClosed()) {
                this.deps.logger.warn('device_auth_error', details);
                return;
            }
            this.deps.logger.error('device_auth_error', details);
            this.close(CloseCode.InternalError, 'internal_error');
            return;
        }
        // The socket went away while the credentials were checked
        if (this.isClosed()) {
            return;
        }
        // A token rotated (or arena deleted) while bcrypt ran must not let the old token in
        if (!arena || this.deps.connections.revokedSince(arena.id, revision)) {
            this.close(CloseCode.BadCredentials, 'bad_credentials');
            return;
        }
        if (hello.protocol !== PROTOCOL_VERSION) {
            this.deps.logger.warn('device_protocol_unsupported', {
                deviceId: hello.deviceId,
                protocol: hello.protocol,
            });
            this.close(CloseCode.UnsupportedProtocol, 'unsupported_protocol');
            return;
        }

        this.arena = arena;
        this.state = 'authenticated';
        const previous = this.deps.connections.claim(arena.id, this.socket);
        previous?.close(CloseCode.Replaced, 'replaced');
        this.socket.send(welcomeFrame(arena.name));
    }

    /**
     * Closed, or closing: ws only emits 'close' (onClose) once the close handshake ends, which
     * can take up to 30 s, so a socket that is CLOSING must already count as gone. A method, so
     * TypeScript doesn't narrow `state` across the await in login().
     */
    private isClosed(): boolean {
        return (
            this.state === 'closed' || this.socket.readyState !== SOCKET_OPEN
        );
    }

    private sendError(
        code: Parameters<typeof errorFrame>[0],
        message: string,
    ): void {
        this.socket.send(errorFrame(code, message));
    }

    private close(code: number, reason: string): void {
        this.state = 'closed';
        this.stopTimers();
        this.socket.close(code, reason);
    }

    /**
     * Rejects if the check takes longer than CHECK_TIMEOUT_MS, so a hung database can't park the
     * socket, and gives the check slot back either way
     */
    private withCheckTimeout<T>(check: Promise<T>): Promise<T> {
        const timeout = new Promise<never>((_, reject) => {
            this.checkTimer = setTimeout(
                () => reject(new Error('credential check timed out')),
                CHECK_TIMEOUT_MS,
            );
        });
        // Settles once, on the result or the timeout: the slot is released exactly once
        return Promise.race([check, timeout]).finally(() => {
            clearTimeout(this.checkTimer);
            this.checkTimer = undefined;
            this.deps.checks.release();
        });
    }

    private stopTimers(): void {
        clearTimeout(this.helloTimer);
        clearTimeout(this.checkTimer);
        clearInterval(this.heartbeat);
    }
}
