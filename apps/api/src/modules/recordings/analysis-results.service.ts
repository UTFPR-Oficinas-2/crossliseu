import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
    AnalysisQueue,
    type AnalysisResult,
} from '../analysis/analysis-queue.js';
import type {
    AnalysisStatus,
    MatchVideo,
} from './entities/match-video.entity.js';
import { MatchVideosRepository } from './match-videos.repository.js';

type Changes = Pick<
    MatchVideo,
    'analysisStatus' | 'analysisError' | 'analysisResult'
>;

/**
 * What each worker message does to the analysis, and from which states. The worker sends
 * running -> done | failed for every job; a duplicate (a job redone after a crash) or a message
 * that arrives late finds the analysis already past it and changes nothing.
 */
export function transitionFor(result: AnalysisResult): {
    from: readonly AnalysisStatus[];
    changes: Changes;
} {
    switch (result.status) {
        case 'running':
            return {
                from: ['pending'],
                changes: {
                    analysisStatus: 'running',
                    analysisError: null,
                    analysisResult: null,
                },
            };
        case 'done':
            return {
                from: ['pending', 'running'],
                changes: {
                    analysisStatus: 'done',
                    analysisError: null,
                    analysisResult: result.details,
                },
            };
        case 'failed':
            return {
                from: ['pending', 'running'],
                changes: {
                    analysisStatus: 'failed',
                    analysisError:
                        typeof result.details.error === 'string'
                            ? result.details.error
                            : 'processing_failed',
                    analysisResult: null,
                },
            };
    }
}

/**
 * Reads the CV worker's results (analysis.finished) and stores them on the match's video (#21).
 * Started at bootstrap, after AnalysisQueue has connected.
 */
@Injectable()
export class AnalysisResultsService implements OnApplicationBootstrap {
    private readonly logger = new Logger(AnalysisResultsService.name);

    constructor(
        private readonly queue: AnalysisQueue,
        private readonly videos: MatchVideosRepository,
    ) {}

    onApplicationBootstrap() {
        this.queue.consumeResults((result) => this.apply(result));
    }

    /** Stores one result; a result for a replaced video, or one that arrives late, is ignored */
    async apply(result: AnalysisResult): Promise<void> {
        const { from, changes } = transitionFor(result);
        const applied = await this.videos.updateAnalysis(
            result.matchId,
            result.videoKey,
            from,
            changes,
        );

        if (applied) {
            this.logger.log(`analysis ${result.status}`, {
                matchId: result.matchId,
                ...(changes.analysisError && { error: changes.analysisError }),
            });
        } else {
            this.logger.warn('analysis_result_ignored', {
                matchId: result.matchId,
                videoKey: result.videoKey,
                status: result.status,
            });
        }
    }
}
