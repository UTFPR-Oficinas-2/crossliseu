import {
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { ChampionshipsService } from '../../championships/championships.service.js';
import type { MatchState } from '../entities/match.entity.js';
import type { MatchEvent } from '../entities/match-event.entity.js';
import { Clock } from './clock.js';
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

@Injectable()
export class FightService {
    logger: Logger = new Logger(FightService.name);

    constructor(
        private readonly repo: FightRepository,
        private readonly championships: ChampionshipsService,
        private readonly clock: Clock,
    ) {}

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
                const now = this.clock.now();
                const settled = await this.settleLocked(fight, writes, now);
                const transition = transitionFor(
                    command,
                    settled.state,
                    settled.events.some((e) => e.type === 'closed'),
                );
                if (!transition) {
                    // Returned, not thrown: a time-out settled above must still commit
                    return { ok: false };
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
                return { ok: true };
            },
        );
        if (!result) {
            throw this.notFound(matchId);
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

    /** Settles a time-out if the match is ongoing and out of time; true when it wrote one */
    async settle(matchId: string): Promise<boolean> {
        const wrote = await this.repo.withLockedFight(
            matchId,
            async (fight, writes) =>
                // `now` is read after the locks, so events are written in lock order
                (await this.settleLocked(fight, writes, this.clock.now()))
                    .wrote,
        );
        return wrote ?? false;
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
        const occurredAt = timeOutAt(match.state, events) ?? now;
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
