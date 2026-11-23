import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { Match } from '../entities/match.entity.js';
import { MatchEvent } from '../entities/match-event.entity.js';
import type { JudgeSeat } from '../entities/match-event.entity.js';
import { MatchReferee } from '../entities/match-referee.entity.js';
import { seatCounts, type SideCounts } from '../fight/score.js';

export const SEATS: readonly JudgeSeat[] = [1, 2, 3];

export type JoinOutcome =
    | { kind: 'invalid_token' }
    | { kind: 'seats_full' }
    | {
          kind: 'seated';
          matchId: string;
          seat: JudgeSeat;
          name: string;
          counts: SideCounts;
      };

/** `closed` exists for the match, read through `manager` */
function closedIn(manager: EntityManager, matchId: string): Promise<boolean> {
    return manager.exists(MatchEvent, { where: { matchId, type: 'closed' } });
}

@Injectable()
export class RefereesRepository {
    constructor(
        @InjectRepository(Match)
        private readonly matches: Repository<Match>,
    ) {}

    /** The live match, without relations; soft-deleted ones are left out */
    findMatch(
        matchId: string,
    ): Promise<Pick<Match, 'id' | 'championshipId'> | null> {
        return this.matches.findOne({
            select: { id: true, championshipId: true },
            where: { id: matchId },
        });
    }

    /** The match was confirmed: it has a `closed` event */
    isClosed(matchId: string): Promise<boolean> {
        return closedIn(this.matches.manager, matchId);
    }

    /**
     * Seats `name` on the match whose token this is. One transaction holding the match row lock,
     * so concurrent joins can't take the same seat: the same name (case-insensitive) gets its
     * seat back, a new one the lowest free seat while fewer than three are seated.
     */
    join(token: string, name: string): Promise<JoinOutcome> {
        return this.matches.manager.transaction(async (manager) => {
            // `find` leaves out soft-deleted matches
            const match = await manager.findOne(Match, {
                select: { id: true, robotAId: true, robotBId: true },
                where: { refereeToken: token },
                lock: { mode: 'pessimistic_write' },
            });
            if (!match || (await closedIn(manager, match.id))) {
                return { kind: 'invalid_token' };
            }
            const seated = await manager.find(MatchReferee, {
                where: { matchId: match.id },
            });
            // Postgres lower(), as the unique index uses: JS toLowerCase differs on some letters
            let referee = await manager
                .createQueryBuilder(MatchReferee, 'referee')
                .where('referee.matchId = :matchId', { matchId: match.id })
                .andWhere('lower(referee.name) = lower(:name)', { name })
                .getOne();
            if (!referee) {
                const free = SEATS.find(
                    (seat) => !seated.some((r) => r.seat === seat),
                );
                if (free === undefined) {
                    return { kind: 'seats_full' };
                }
                referee = manager.create(MatchReferee, {
                    matchId: match.id,
                    name,
                    seat: free,
                });
                await manager.insert(MatchReferee, referee);
            }
            const events = await manager.find(MatchEvent, {
                where: {
                    matchId: match.id,
                    type: 'scored',
                    judgeSeat: referee.seat,
                },
            });
            return {
                kind: 'seated',
                matchId: match.id,
                seat: referee.seat,
                name: referee.name,
                counts: seatCounts(
                    events,
                    { A: match.robotAId, B: match.robotBId },
                    referee.seat,
                ),
            };
        });
    }

    /**
     * The seat `name` holds on the live, not yet closed match whose token this is; null
     * otherwise. Never seats anybody.
     */
    async findSeat(
        token: string,
        name: string,
    ): Promise<{ matchId: string; seat: JudgeSeat } | null> {
        const row = await this.matches.manager
            .createQueryBuilder(MatchReferee, 'referee')
            .select('referee.matchId', 'matchId')
            .addSelect('referee.seat', 'seat')
            .innerJoin(Match, 'fight', 'fight.id = referee.matchId')
            .where('fight.refereeToken = :token', { token })
            .andWhere('fight.deletedAt IS NULL')
            .andWhere('lower(referee.name) = lower(:name)', { name })
            .andWhere(
                `NOT EXISTS (SELECT 1 FROM "match_events" "closed" WHERE "closed"."match_id" = "fight"."id" AND "closed"."type" = 'closed')`,
            )
            .getRawOne<{ matchId: string; seat: JudgeSeat }>();
        return row ?? null;
    }

    /** `referee_token` is select: false, so it is read explicitly */
    async findToken(matchId: string): Promise<string | null> {
        const match = await this.matches.findOne({
            select: { id: true, refereeToken: true },
            where: { id: matchId },
        });
        return match?.refereeToken ?? null;
    }

    /** Stores `token` unless the match already has one: the first writer wins */
    async claimToken(matchId: string, token: string): Promise<void> {
        await this.matches.update(
            { id: matchId, refereeToken: IsNull() },
            { refereeToken: token },
        );
    }
}
