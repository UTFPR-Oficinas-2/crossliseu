import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';
import { Match } from '../entities/match.entity.js';
import { MatchEvent } from '../entities/match-event.entity.js';
import type { MatchEventType } from '../entities/match-event.entity.js';
import { Arena } from '../../arenas/entities/arena.entity.js';

export interface LockedFight {
    /** Locked FOR UPDATE, without relations */
    match: Match;
    /** This match's events, by occurred_at */
    events: MatchEvent[];
    /** The live arena whose current_match_id is this match */
    arenaId: string | null;
}

export interface FightWrites {
    appendEvent(
        type: MatchEventType,
        occurredAt: Date,
        actorUserId: string | null,
    ): Promise<void>;
    updateMatch(
        patch: Pick<
            QueryDeepPartialEntity<Match>,
            'state' | 'endReason' | 'arenaId' | 'winnerRobotId'
        >,
    ): Promise<void>;
    /** Clears current_match_id on the live arenas pointing at this match */
    clearArenaPointer(): Promise<void>;
}

@Injectable()
export class FightRepository {
    constructor(
        @InjectRepository(Match)
        private readonly repository: Repository<Match>,
    ) {}

    /**
     * One transaction: lock the arenas pointing at the match, then the match (arena before match,
     * like MatchesRepository), load its events, run `work`. Null when the match is gone.
     */
    withLockedFight<T>(
        matchId: string,
        work: (fight: LockedFight, writes: FightWrites) => Promise<T>,
    ): Promise<T | null> {
        return this.repository.manager.transaction(async (manager) => {
            // Read through the manager so this module doesn't depend on ArenasModule
            await manager.find(Arena, {
                select: { id: true },
                where: { currentMatchId: matchId },
                order: { id: 'ASC' },
                lock: { mode: 'pessimistic_write' },
            });
            const match = await manager.findOne(Match, {
                where: { id: matchId },
                lock: { mode: 'pessimistic_write' },
            });
            if (!match) {
                return null;
            }
            // Read after the match lock, so a second settler sees the first one's committed
            // `finished` row and state (FOR UPDATE re-reads the latest committed row)
            const events = await manager.find(MatchEvent, {
                where: { matchId },
                order: { occurredAt: 'ASC', id: 'ASC' },
            });
            // PUT/DELETE /arenas/:id/current-match lock the arena, then the match. Holding the
            // match lock, the pointer to this match can't change any more, so this read can't
            // miss a pick that committed while we waited. Deliberately not locked: locking an
            // arena after the match would invert the lock order and could deadlock.
            const arena = await manager.findOne(Arena, {
                select: { id: true },
                where: { currentMatchId: matchId },
            });

            const writes: FightWrites = {
                appendEvent: async (type, occurredAt, actorUserId) => {
                    await manager.insert(MatchEvent, {
                        matchId,
                        type,
                        occurredAt,
                        actorUserId,
                    });
                },
                updateMatch: async (patch) => {
                    await manager.update(Match, { id: matchId }, patch);
                },
                clearArenaPointer: async () => {
                    // Live arenas only: a soft-deleted arena keeps its history
                    await manager.update(
                        Arena,
                        { currentMatchId: matchId, deletedAt: IsNull() },
                        { currentMatchId: null },
                    );
                },
            };
            return work({ match, events, arenaId: arena?.id ?? null }, writes);
        });
    }

    /** The match row alone, no relations */
    findMatch(matchId: string): Promise<Match | null> {
        return this.repository.findOne({ where: { id: matchId } });
    }

    /** Ids of the live matches that are `ongoing`; soft-deleted ones are left out by `find` */
    async findOngoingIds(): Promise<string[]> {
        const matches = await this.repository.find({
            select: { id: true },
            where: { state: 'ongoing' },
        });
        return matches.map((m) => m.id);
    }

    /** Match with robotA / robotB, for building FightState */
    findWithRobots(matchId: string): Promise<Match | null> {
        return this.repository.findOne({
            where: { id: matchId },
            relations: { robotA: true, robotB: true },
        });
    }

    /** Events of one match, by occurred_at */
    findEvents(matchId: string): Promise<MatchEvent[]> {
        return this.repository.manager.find(MatchEvent, {
            where: { matchId },
            order: { occurredAt: 'ASC', id: 'ASC' },
        });
    }
}
