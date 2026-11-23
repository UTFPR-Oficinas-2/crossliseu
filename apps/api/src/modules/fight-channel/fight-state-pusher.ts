import {
    Injectable,
    Logger,
    NotFoundException,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { FightEvents } from '../matches/fight/fight-events.js';
import { FightService } from '../matches/fight/fight.service.js';
import type { FightAccess } from './fight-access.js';
import { FightCloseCode, stateFrame } from './fight-channel-protocol.js';
import { FightConnections } from './fight-connections.js';
import { SOCKET_OPEN, type FightSocket } from './fight-session.js';

type Role = FightAccess['role'];

/**
 * Sends the subscribers of each match its `state` on every committed fight change, and the first
 * snapshot to a socket that just subscribed. Referees get the public state, operators the
 * operator state.
 */
@Injectable()
export class FightStatePusher implements OnModuleInit, OnModuleDestroy {
    logger: Logger = new Logger(FightStatePusher.name);

    /** The tail of each match's chain; an entry is dropped once its tail settles */
    private readonly chains = new Map<string, Promise<unknown>>();
    private unsubscribe: (() => void) | undefined;

    constructor(
        private readonly connections: FightConnections,
        private readonly fight: FightService,
        private readonly events: FightEvents,
    ) {}

    onModuleInit(): void {
        this.unsubscribe = this.events.onChange((change) => {
            void this.push(change.matchId);
        });
    }

    onModuleDestroy(): void {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
    }

    /**
     * Sends the match's subscribers its current `state`. Pushes (and snapshots) for one match run
     * in call order and each reads the state when its turn comes, so a socket's last frame is
     * never older than the last change. Never rejects: a failure is only logged.
     */
    push(matchId: string): Promise<void> {
        if (!this.connections.hasSubscribers(matchId)) {
            return Promise.resolve();
        }
        return this.enqueue(matchId, () => this.send(matchId));
    }

    /**
     * The first frame for one socket: false when the match doesn't exist. Other failures reject,
     * for the caller to close the socket with. The caller must add the socket to FightConnections
     * before calling this, or a change that lands while the snapshot is read is not pushed to it.
     */
    sendSnapshot(
        matchId: string,
        role: Role,
        socket: FightSocket,
    ): Promise<boolean> {
        return this.enqueue(matchId, async () => {
            try {
                const state = await this.read(matchId, role);
                socket.send(stateFrame(state));
                return true;
            } catch (error) {
                if (error instanceof NotFoundException) {
                    return false;
                }
                throw error;
            }
        });
    }

    private enqueue<T>(matchId: string, task: () => Promise<T>): Promise<T> {
        const previous = this.chains.get(matchId) ?? Promise.resolve();
        // The tail swallows failures, so one failing task never breaks the chain
        const next = previous.then(task);
        const tail = next.catch(() => undefined);
        this.chains.set(matchId, tail);
        void tail.then(() => {
            if (this.chains.get(matchId) === tail) {
                this.chains.delete(matchId);
            }
        });
        return next;
    }

    private read(matchId: string, role: Role) {
        return role === 'operator'
            ? this.fight.operatorState(matchId)
            : this.fight.state(matchId);
    }

    private async send(matchId: string): Promise<void> {
        try {
            const subscribers = this.connections.subscribers(matchId);
            if (subscribers.length === 0) {
                return;
            }
            // Each state is read once per push, and only for the roles present
            const frames = new Map<Role, string>();
            for (const role of new Set(subscribers.map((s) => s.role))) {
                frames.set(role, stateFrame(await this.read(matchId, role)));
            }
            for (const { role, socket } of this.connections.subscribers(
                matchId,
            )) {
                const frame = frames.get(role);
                if (frame === undefined) {
                    continue; // Subscribed while the state was being read: its snapshot follows
                }
                this.deliver(matchId, socket, frame);
            }
        } catch (error) {
            if (error instanceof NotFoundException) {
                this.connections.closeMatch(
                    matchId,
                    FightCloseCode.MatchNotFound,
                    'match_not_found',
                );
                return;
            }
            this.logger.warn('fight_state_push_failed', {
                matchId,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /** A socket that isn't open or throws on send is forgotten; the others still get the frame */
    private deliver(matchId: string, socket: FightSocket, frame: string): void {
        if (socket.readyState !== SOCKET_OPEN) {
            this.connections.remove(socket);
            return;
        }
        try {
            socket.send(frame);
        } catch (error) {
            this.connections.remove(socket);
            this.logger.debug('fight_state_push_dropped', {
                matchId,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
