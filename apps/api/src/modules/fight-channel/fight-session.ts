import type { Logger } from '@nestjs/common';
import type { FightAccess } from './fight-access.js';
import {
    errorFrame,
    FIGHT_AUTH_TIMEOUT_MS,
    FightCloseCode,
    parseAuth,
    parseFrame,
    pingFrame,
    PING_INTERVAL_MS,
    type Auth,
    type ErrorCode,
} from './fight-channel-protocol.js';

/** ws readyState of an open socket */
export const SOCKET_OPEN = 1;

export type FightSocket = {
    readyState: number;
    send(text: string): void;
    close(code: number, reason: string): void;
    ping(): void;
    terminate(): void;
};

export type FightSessionDeps = {
    verify(credential: Auth): Promise<FightAccess | null>;
    /** Slots for running credential checks; acquire() is false when all are taken */
    checks: { acquire(): boolean; release(): void };
    logger: Pick<Logger, 'warn' | 'error'>;
    /** Registers the socket and sends it the first snapshot; false when the match doesn't exist */
    subscribe(
        matchId: string,
        role: FightAccess['role'],
        socket: FightSocket,
    ): Promise<boolean>;
};

type State = 'awaiting_auth' | 'checking' | 'subscribed' | 'closed';

/**
 * One browser socket on /fights: the handshake, the error replies and the heartbeat. Knows
 * nothing about ws or Nest, so it runs on a fake socket in tests.
 */
export class FightSession {
    private state: State = 'awaiting_auth';
    private alive = true;
    private authTimer: ReturnType<typeof setTimeout> | undefined;
    private checkTimer: ReturnType<typeof setTimeout> | undefined;
    private readonly heartbeat: ReturnType<typeof setInterval>;
    private subscribedMatchId: string | null = null;

    /** Starts the auth timer and the heartbeat */
    constructor(
        private readonly socket: FightSocket,
        private readonly deps: FightSessionDeps,
    ) {
        this.authTimer = setTimeout(
            () => this.close(FightCloseCode.AuthTimeout, 'auth_timeout'),
            FIGHT_AUTH_TIMEOUT_MS,
        );
        // A client that missed the previous ping by the next tick is gone
        this.heartbeat = setInterval(() => {
            if (!this.alive) {
                this.socket.terminate();
                return;
            }
            this.alive = false;
            this.socket.ping();
            // Browsers can't see ws pings: subscribed clients get one they can
            if (this.state === 'subscribed') {
                this.socket.send(pingFrame());
            }
        }, PING_INTERVAL_MS);
    }

    /** The match this socket asked to follow; null until set just before `subscribe` is attempted, after a verified auth */
    get matchId(): string | null {
        return this.subscribedMatchId;
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

        if (frame.event === 'auth') {
            if (this.state === 'awaiting_auth') {
                await this.login(frame.data);
            } else {
                this.sendError('already_authenticated', 'Already logged in');
            }
            return;
        }

        if (this.state === 'subscribed') {
            this.sendError('unknown_event', `Unknown event "${frame.event}"`);
        } else {
            this.sendError('not_authenticated', 'Send auth first');
        }
    }

    onPong(): void {
        this.alive = true;
    }

    /** The socket closed (any cause): stop timers */
    onClose(): void {
        this.state = 'closed';
        this.stopTimers();
    }

    private async login(data: unknown): Promise<void> {
        clearTimeout(this.authTimer);
        this.authTimer = undefined;

        const parsed = parseAuth(data);
        if (!parsed.ok) {
            if (parsed.reason === 'bad_credentials') {
                this.close(FightCloseCode.BadCredentials, 'bad_credentials');
            } else {
                this.close(FightCloseCode.MatchNotFound, 'match_not_found');
            }
            return;
        }
        const { auth } = parsed;

        if (!this.deps.checks.acquire()) {
            this.deps.logger.warn('fight_checks_busy', {
                matchId: auth.matchId,
            });
            this.close(FightCloseCode.ServerBusy, 'server_busy');
            return;
        }
        this.state = 'checking';
        let access: FightAccess | null;
        try {
            access = await this.withCheckTimeout(this.deps.verify(auth), true);
        } catch (error) {
            this.failed('fight_auth_error', auth.matchId, error);
            return;
        }
        // The socket went away while the credentials were checked
        if (this.isClosed()) {
            return;
        }
        if (!access) {
            this.close(FightCloseCode.BadCredentials, 'bad_credentials');
            return;
        }

        // Set before subscribing: the socket is registered from there on
        this.subscribedMatchId = auth.matchId;
        let found: boolean;
        try {
            found = await this.withCheckTimeout(
                this.deps.subscribe(auth.matchId, access.role, this.socket),
                false,
            );
        } catch (error) {
            this.failed('fight_subscribe_error', auth.matchId, error);
            return;
        }
        if (this.isClosed()) {
            return;
        }
        if (!found) {
            this.close(FightCloseCode.MatchNotFound, 'match_not_found');
            return;
        }
        this.state = 'subscribed';
    }

    /** A failed check or subscribe: 1011, or only a warning when the socket is already gone */
    private failed(event: string, matchId: string, error: unknown): void {
        const details = {
            matchId,
            message: error instanceof Error ? error.message : String(error),
        };
        if (this.isClosed()) {
            this.deps.logger.warn(event, details);
            return;
        }
        this.deps.logger.error(event, details);
        this.close(FightCloseCode.InternalError, 'internal_error');
    }

    /**
     * Closed, or closing: ws only emits 'close' (onClose) once the close handshake ends, which
     * can take up to 30 s, so a socket that is CLOSING must already count as gone. A method, so
     * TypeScript doesn't narrow `state` across the awaits in login().
     */
    private isClosed(): boolean {
        return (
            this.state === 'closed' || this.socket.readyState !== SOCKET_OPEN
        );
    }

    private sendError(code: ErrorCode, message: string): void {
        this.socket.send(errorFrame(code, message));
    }

    private close(code: number, reason: string): void {
        this.state = 'closed';
        this.stopTimers();
        this.socket.close(code, reason);
    }

    /**
     * Rejects if `work` takes longer than FIGHT_AUTH_TIMEOUT_MS, so a hung database can't park the
     * socket. With `holdsSlot` the check slot is given back when the work itself settles (once),
     * not on the timeout and not when the socket closes meanwhile.
     */
    private withCheckTimeout<T>(
        work: Promise<T>,
        holdsSlot: boolean,
    ): Promise<T> {
        const timeout = new Promise<never>((_, reject) => {
            this.checkTimer = setTimeout(
                () => reject(new Error('fight check timed out')),
                FIGHT_AUTH_TIMEOUT_MS,
            );
        });
        if (holdsSlot) {
            const release = () => this.deps.checks.release();
            work.then(release, release);
        }
        return Promise.race([work, timeout]).finally(() => {
            clearTimeout(this.checkTimer);
            this.checkTimer = undefined;
        });
    }

    private stopTimers(): void {
        clearTimeout(this.authTimer);
        clearTimeout(this.checkTimer);
        clearInterval(this.heartbeat);
    }
}
