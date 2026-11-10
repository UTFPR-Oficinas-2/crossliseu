import {
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { ChampionshipsService } from '../../championships/championships.service.js';
import type { MatchState } from '../entities/match.entity.js';
import type { MatchEvent } from '../entities/match-event.entity.js';
import { Clock } from './clock.js';
import { FightEvents } from './fight-events.js';
import { FightTimer } from './fight-timer.js';
import { remainingMs, timeOutAt } from './fight-clock.js';
import type { FightState } from './fight-state.js';
import { transitionFor } from './fight-transitions.js';
import type { FightCommand } from './fight-transitions.js';
import { FightRepository } from './fight.repository.js';
import type { FightWrites, LockedFight } from './fight.repository.js';

interface Settled {
    state: MatchState;
    events: MatchEvent[];
    wrote: boolean;
}

export type SurrenderResult = 'done' | 'not_current_match' | 'not_ongoing';

/**
 * When a new event is stamped: `wanted`, but strictly after the latest event. The clock's order
 * is by `occurredAt`, so events sharing an instant (two commands a millisecond apart, a clock
 * stepped back) would otherwise be ordered at random.
 */
function eventTime(wanted: Date, events: readonly MatchEvent[]): Date {
    const last = events.reduce(
        (max, e) => Math.max(max, e.occurredAt.getTime()),
        -Infinity,
    );
    return new Date(Math.max(wanted.getTime(), last + 1));
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class FightService implements OnApplicationBootstrap, OnModuleDestroy {
    logger: Logger = new Logger(FightService.name);

    constructor(
        private readonly repo: FightRepository,
        private readonly championships: ChampionshipsService,
        private readonly clock: Clock,
        private readonly events: FightEvents,
        private readonly timer: FightTimer,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            await this.restoreTimeOuts();
        } catch (error) {
            this.logger.error('fight_timer_restore_failed', {
                message: errorMessage(error),
            });
        }
    }

    onModuleDestroy(): void {
        this.timer.cancelAll();
    }

    /** Arms the time-out of every ongoing match, one after another. Run once at boot. */
    async restoreTimeOuts(): Promise<void> {
        for (const matchId of await this.repo.findOngoingIds()) {
            await this.syncTimer(matchId);
        }
    }

    /** Owner-only. 404 match_not_found, 409 match_invalid_transition. Returns the state after. */
    async command(
        matchId: string,
        command: FightCommand,
        userId: string,
    ): Promise<FightState> {
        const match = await this.repo.findWithRobots(matchId);
        if (
            !match ||
            !(await this.championships.isOwnedBy(match.championshipId, userId))
        ) {
            throw this.notFound(matchId);
        }

        const result = await this.repo.withLockedFight(
            matchId,
            async (fight, writes) => {
                // Read after the locks, so events are written in lock order
                const settled = await this.settleLocked(
                    fight,
                    writes,
                    this.clock.now(),
                );
                const now = eventTime(this.clock.now(), settled.events);
                const transition = transitionFor(
                    command,
                    settled.state,
                    settled.events.some((e) => e.type === 'closed'),
                );
                if (!transition) {
                    // Returned, not thrown: a time-out settled above must still commit
                    return {
                        ok: false,
                        wrote: settled.wrote,
                        arenaId: fight.arenaId,
                    };
                }
                if (command === 'start') {
                    await writes.updateMatch({
                        state: 'ongoing',
                        arenaId: fight.arenaId,
                    });
                    await writes.appendEvent('started', now, userId);
                } else if (command === 'close') {
                    await writes.appendEvent('closed', now, userId);
                    await writes.clearArenaPointer();
                } else {
                    await writes.updateMatch({
                        state: transition.to,
                        ...(transition.endReason && {
                            endReason: transition.endReason,
                        }),
                    });
                    await writes.appendEvent(transition.event, now, userId);
                }
                // Read before the writes: close clears the pointer, yet that arena must hear of it
                return { ok: true, wrote: true, arenaId: fight.arenaId };
            },
        );
        if (!result) {
            throw this.notFound(matchId);
        }
        // After the commit, so listeners read what was written
        if (result.wrote) {
            this.events.emit({ matchId, arenaId: result.arenaId });
            await this.trySyncTimer(matchId);
        }
        if (!result.ok) {
            this.logger.warn('match_invalid_transition', { matchId, command });
            throw new ConflictException('match_invalid_transition');
        }
        return this.buildState(matchId);
    }

    /** Public. Settles first. 404 match_not_found. */
    async state(matchId: string): Promise<FightState> {
        await this.settle(matchId);
        return this.buildState(matchId);
    }

    /**
     * Settles a time-out if the match is ongoing and out of time. True means the caller's
     * `ongoing` row may be stale and should be re-read: this call wrote the time-out, or the
     * match was no longer `ongoing` when looked at (a concurrent settle, pause or finish got
     * there first). False for a fight with time left and for an unknown match.
     *
     * The first look takes no locks, so public reads of a fight with time left never wait for the
     * operator's commands. Only an expired-looking fight opens the locking transaction, which
     * checks again.
     */
    async settle(matchId: string): Promise<boolean> {
        const match = await this.repo.findMatch(matchId);
        if (!match) {
            return false;
        }
        if (match.state !== 'ongoing') {
            return true;
        }
        const events = await this.repo.findEvents(matchId);
        if (remainingMs(match.state, events, this.clock.now()) !== 0) {
            return false;
        }
        const expired = await this.repo.withLockedFight(
            matchId,
            async (fight, writes) => {
                // `now` is read after the locks, so events are written in lock order
                const settled = await this.settleLocked(
                    fight,
                    writes,
                    this.clock.now(),
                );
                return {
                    wrote: settled.wrote,
                    // Not ongoing any more: somebody else settled it while we waited for the lock
                    expired: settled.wrote || fight.match.state !== 'ongoing',
                    arenaId: fight.arenaId,
                };
            },
        );
        if (expired?.wrote) {
            this.events.emit({ matchId, arenaId: expired.arenaId });
            await this.trySyncTimer(matchId);
        }
        return expired?.expired ?? false;
    }

    /**
     * A surrender button press from the box in `arenaId` (docs/arena-protocol.md, `surrender`).
     * Counts only when `matchId` is that arena's current match and it is `ongoing`; the other
     * side wins. A time-out that was due is settled first, so a press after time ran out is
     * `not_ongoing` and the match ends as `time_out`.
     */
    async surrender(
        arenaId: string,
        matchId: string | null,
        side: 'A' | 'B',
    ): Promise<SurrenderResult> {
        // From the box, unchecked: a malformed id would fail the uuid column's cast
        if (matchId === null || !isUUID(matchId)) {
            return 'not_current_match';
        }
        const outcome = await this.repo.withLockedFight(
            matchId,
            async (fight, writes) => {
                // `now` is read after the locks, so events are written in lock order
                const settled = await this.settleLocked(
                    fight,
                    writes,
                    this.clock.now(),
                );
                const done = (result: SurrenderResult, wrote: boolean) => ({
                    result,
                    wrote,
                    arenaId: fight.arenaId,
                });
                if (fight.arenaId !== arenaId) {
                    return done('not_current_match', settled.wrote);
                }
                if (settled.state !== 'ongoing') {
                    return done('not_ongoing', settled.wrote);
                }
                const { match } = fight;
                await writes.updateMatch({
                    state: 'finished',
                    endReason: 'surrender',
                    winnerRobotId:
                        side === 'A' ? match.robotBId : match.robotAId,
                });
                await writes.appendEvent(
                    'finished',
                    eventTime(this.clock.now(), settled.events),
                    null,
                );
                return done('done', true);
            },
        );
        if (!outcome) {
            return 'not_current_match';
        }
        if (outcome.wrote) {
            this.events.emit({ matchId, arenaId: outcome.arenaId });
            await this.trySyncTimer(matchId);
        }
        return outcome.result;
    }

    /** Arms the timer for an ongoing match, cancels it for any other state */
    private async syncTimer(matchId: string): Promise<void> {
        const match = await this.repo.findMatch(matchId);
        if (!match || match.state !== 'ongoing') {
            this.timer.cancel(matchId);
            return;
        }
        const events = await this.repo.findEvents(matchId);
        const at = timeOutAt(match.state, events);
        if (!at) {
            this.timer.cancel(matchId);
            return;
        }
        this.timer.arm(
            matchId,
            at.getTime() - this.clock.now().getTime(),
            () => {
                void this.onTimeOut(matchId);
            },
        );
    }

    /** After a commit: a timer failure must not turn a successful write into an error */
    private async trySyncTimer(matchId: string): Promise<void> {
        try {
            await this.syncTimer(matchId);
        } catch (error) {
            this.logger.error('fight_timer_sync_failed', {
                matchId,
                message: errorMessage(error),
            });
        }
    }

    private async onTimeOut(matchId: string): Promise<void> {
        try {
            await this.settle(matchId);
            // Re-arms when the timer fired a little early
            await this.syncTimer(matchId);
        } catch (error) {
            this.logger.error('fight_timeout_failed', {
                matchId,
                message: errorMessage(error),
            });
        }
    }

    /** Inside the lock: writes the time-out when due and returns the state and events after */
    private async settleLocked(
        fight: LockedFight,
        writes: FightWrites,
        now: Date,
    ): Promise<Settled> {
        const { match, events } = fight;
        if (
            match.state !== 'ongoing' ||
            remainingMs(match.state, events, now) !== 0
        ) {
            return { state: match.state, events, wrote: false };
        }
        // The instant time ran out, not the instant somebody noticed
        const occurredAt = eventTime(
            timeOutAt(match.state, events) ?? now,
            events,
        );
        await writes.updateMatch({ state: 'finished', endReason: 'time_out' });
        await writes.appendEvent('finished', occurredAt, null);
        return {
            state: 'finished',
            events: [...events, { type: 'finished', occurredAt } as MatchEvent],
            wrote: true,
        };
    }

    private async buildState(matchId: string): Promise<FightState> {
        const match = await this.repo.findWithRobots(matchId);
        if (!match) {
            throw this.notFound(matchId);
        }
        const events = await this.repo.findEvents(matchId);
        return {
            status: match.state,
            matchId: match.id,
            remainingMs: remainingMs(match.state, events, this.clock.now()),
            endReason: match.endReason,
            robots: {
                A: { name: match.robotA?.name ?? '' },
                B: { name: match.robotB?.name ?? '' },
            },
        };
    }

    private notFound(matchId: string) {
        this.logger.warn('match_not_found', { id: matchId });
        return new NotFoundException('match_not_found');
    }
}
