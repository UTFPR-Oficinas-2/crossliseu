import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { ArenasRepository } from '../arenas.repository.js';
import { FightEvents } from '../../matches/fight/fight-events.js';
import { FightService } from '../../matches/fight/fight.service.js';
import { ArenaConnections } from './arena-connections.js';
import { stateFrame } from './arena-protocol.js';

/**
 * Sends each connected box the `state` of its arena's current match (docs/arena-protocol.md):
 * on request (after welcome, after a pick changes) and on every committed fight change.
 */
@Injectable()
export class ArenaStatePusher implements OnModuleInit, OnModuleDestroy {
    logger: Logger = new Logger(ArenaStatePusher.name);

    /** The tail of each arena's push chain; an entry is dropped once its tail settles */
    private readonly chains = new Map<string, Promise<void>>();
    private unsubscribe: (() => void) | undefined;

    constructor(
        private readonly connections: ArenaConnections,
        private readonly arenasRepository: ArenasRepository,
        private readonly fight: FightService,
        private readonly events: FightEvents,
    ) {}

    onModuleInit(): void {
        this.unsubscribe = this.events.onChange((change) => {
            if (change.arenaId !== null) {
                void this.push(change.arenaId);
            }
        });
    }

    onModuleDestroy(): void {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
    }

    /**
     * Sends the arena's box its current `state`, if the box is online. Pushes for one arena go
     * out in call order, and each reads the state when its turn comes, so the last frame sent is
     * never older than the last change. Never rejects: a failure is only logged.
     */
    push(arenaId: string): Promise<void> {
        if (!this.connections.isOnline(arenaId)) {
            return Promise.resolve();
        }
        const previous = this.chains.get(arenaId) ?? Promise.resolve();
        // send() never rejects, so the chain never breaks
        const next = previous.then(() => this.send(arenaId));
        this.chains.set(arenaId, next);
        void next.then(() => {
            if (this.chains.get(arenaId) === next) {
                this.chains.delete(arenaId);
            }
        });
        return next;
    }

    private async send(arenaId: string): Promise<void> {
        try {
            const matchId =
                await this.arenasRepository.findCurrentMatchId(arenaId);
            const frame =
                matchId === null
                    ? stateFrame(null)
                    : stateFrame(await this.fight.state(matchId));
            // False when the box went away meanwhile; its next welcome carries the state
            if (!this.connections.send(arenaId, frame)) {
                this.logger.debug('arena_state_push_dropped', { arenaId });
            }
        } catch (error) {
            this.logger.warn('arena_state_push_failed', {
                arenaId,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
