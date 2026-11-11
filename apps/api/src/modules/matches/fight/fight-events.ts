import { Injectable, Logger } from '@nestjs/common';

/** A committed write changed this match; `arenaId` is the arena showing it (null when none) */
export interface FightChange {
    matchId: string;
    arenaId: string | null;
}

/**
 * In-process notifications of committed fight changes. Lives in MatchesModule so the arenas
 * module can subscribe without MatchesModule importing it.
 */
@Injectable()
export class FightEvents {
    logger: Logger = new Logger(FightEvents.name);

    private readonly listeners = new Set<(change: FightChange) => void>();

    /** Returns the unsubscribe function */
    onChange(listener: (change: FightChange) => void): () => void {
        // Wrapped, so subscribing the same function twice gets two entries
        const entry = (change: FightChange) => listener(change);
        this.listeners.add(entry);
        return () => {
            this.listeners.delete(entry);
        };
    }

    /** Calls the listeners synchronously, in subscription order; a throwing one is only logged */
    emit(change: FightChange): void {
        for (const listener of this.listeners) {
            try {
                listener(change);
            } catch (error) {
                this.logger.warn('fight_listener_failed', {
                    ...change,
                    error: error instanceof Error ? error.message : error,
                });
            }
        }
    }
}
