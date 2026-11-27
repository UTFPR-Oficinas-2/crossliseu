import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChampionshipsService } from '../championships/championships.service.js';
import { Clock } from '../matches/fight/clock.js';
import { MatchVideosRepository } from '../recordings/match-videos.repository.js';
import { publicAnalysis } from '../recordings/public-analysis.js';
import { RecordingStorage } from '../recordings/recording-storage.js';
import {
    fightResult,
    resultSummary,
    type FightResult,
    type ResultSummary,
} from './fight-result-view.js';
import { ResultsRepository } from './results.repository.js';

/** Confirmed fights for anyone, without login (#22): only fights the operator closed */
@Injectable()
export class ResultsService {
    private readonly logger = new Logger(ResultsService.name);

    constructor(
        private readonly repo: ResultsRepository,
        private readonly championships: ChampionshipsService,
        private readonly videos: MatchVideosRepository,
        private readonly storage: RecordingStorage,
        private readonly clock: Clock,
    ) {}

    /** The championship's confirmed fights, most recently closed first */
    async championshipResults(
        championshipId: string,
    ): Promise<ResultSummary[]> {
        // 404 championship_not_found when it does not exist
        await this.championships.findOne(championshipId);

        const summaries = (await this.repo.closedMatches(championshipId))
            .map(({ match, events }) => resultSummary(match, events))
            .filter((summary): summary is ResultSummary => summary !== null);
        return summaries.sort((a, b) => b.closedAt.localeCompare(a.closedAt));
    }

    /** One confirmed fight; an unknown and an unconfirmed fight get the same 404 */
    async fightResult(matchId: string): Promise<FightResult> {
        const found = await this.repo.match(matchId);
        const isClosed = found?.events.some((event) => event.type === 'closed');
        if (!found || !isClosed) {
            this.logger.warn('result_not_found', { matchId });
            throw new NotFoundException('result_not_found');
        }

        const analysis = await publicAnalysis(
            await this.videos.findByMatch(matchId),
            this.storage,
            this.clock.now(),
        );
        // Not null: the fight is closed
        return fightResult(found.match, found.events, analysis)!;
    }
}
