import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MatchEvent } from '../matches/entities/match-event.entity.js';
import { Match } from '../matches/entities/match.entity.js';

/** A match with its robots loaded and every event it has */
export interface MatchWithEvents {
    match: Match;
    events: MatchEvent[];
}

/** Read-only queries behind the public results (#22) */
@Injectable()
export class ResultsRepository {
    constructor(
        @InjectRepository(Match)
        private readonly matches: Repository<Match>,
        @InjectRepository(MatchEvent)
        private readonly events: Repository<MatchEvent>,
    ) {}

    /** The championship's matches that have a `closed` event, with their events; unordered */
    async closedMatches(championshipId: string): Promise<MatchWithEvents[]> {
        const closed = await this.events
            .createQueryBuilder('event')
            .innerJoin('event.match', 'match')
            .select('event.matchId', 'matchId')
            .where('event.type = :type', { type: 'closed' })
            .andWhere('match.championshipId = :championshipId', {
                championshipId,
            })
            .getRawMany<{ matchId: string }>();
        return this.withEvents(closed.map((row) => row.matchId));
    }

    /** One match with its events, or null when it does not exist */
    async match(id: string): Promise<MatchWithEvents | null> {
        const [found] = await this.withEvents([id]);
        return found ?? null;
    }

    /** Matches and events in two queries, whatever the number of matches */
    private async withEvents(ids: string[]): Promise<MatchWithEvents[]> {
        if (ids.length === 0) return [];
        const [matches, events] = await Promise.all([
            this.matches.find({
                where: { id: In(ids) },
                relations: { robotA: true, robotB: true },
            }),
            this.events.find({ where: { matchId: In(ids) } }),
        ]);
        return matches.map((match) => ({
            match,
            events: events.filter((event) => event.matchId === match.id),
        }));
    }
}
