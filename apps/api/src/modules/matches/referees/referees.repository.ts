import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Match } from '../entities/match.entity.js';
import { MatchEvent } from '../entities/match-event.entity.js';

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
        return this.matches.manager.exists(MatchEvent, {
            where: { matchId, type: 'closed' },
        });
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
