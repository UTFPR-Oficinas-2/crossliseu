import { describe, expect, it, vi } from 'vitest';
import type {
    AnalysisQueue,
    AnalysisResult,
} from '../analysis/analysis-queue.js';
import {
    AnalysisResultsService,
    transitionFor,
} from './analysis-results.service.js';
import type { MatchVideosRepository } from './match-videos.repository.js';

const MATCH_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const VIDEO_KEY = `recordings/${MATCH_ID}/a.mp4`;

function result(
    status: AnalysisResult['status'],
    details: Record<string, unknown> = {},
): AnalysisResult {
    return { matchId: MATCH_ID, videoKey: VIDEO_KEY, status, details };
}

describe('transitionFor', () => {
    it('running: only from pending', () => {
        expect(transitionFor(result('running'))).toEqual({
            from: ['pending'],
            changes: {
                analysisStatus: 'running',
                analysisError: null,
                analysisResult: null,
            },
        });
    });

    it('done: stores what the worker sent, from pending or running', () => {
        const details = {
            mock: true,
            totalFrames: 300,
            trajectoriesKey: `analyses/${MATCH_ID}/trajectories.csv`,
            robots: { A: { detectedPositions: 280 } },
        };

        expect(transitionFor(result('done', details))).toEqual({
            from: ['pending', 'running'],
            changes: {
                analysisStatus: 'done',
                analysisError: null,
                analysisResult: details,
            },
        });
    });

    it("failed: keeps the worker's error code", () => {
        expect(
            transitionFor(
                result('failed', { error: 'video_unreadable', detail: '...' }),
            ).changes,
        ).toEqual({
            analysisStatus: 'failed',
            analysisError: 'video_unreadable',
            analysisResult: null,
        });
    });

    it('failed without a code: processing_failed', () => {
        expect(transitionFor(result('failed')).changes.analysisError).toBe(
            'processing_failed',
        );
    });
});

describe('AnalysisResultsService', () => {
    function setup(applied: boolean) {
        const videos = { updateAnalysis: vi.fn().mockResolvedValue(applied) };
        const queue = { consumeResults: vi.fn() };
        const service = new AnalysisResultsService(
            queue as unknown as AnalysisQueue,
            videos as unknown as MatchVideosRepository,
        );
        return { service, videos, queue };
    }

    it('starts consuming at bootstrap', () => {
        const { service, queue } = setup(true);

        service.onApplicationBootstrap();

        expect(queue.consumeResults).toHaveBeenCalledOnce();
    });

    it('updates the row of that exact video', async () => {
        const { service, videos } = setup(true);

        await service.apply(result('running'));

        expect(videos.updateAnalysis).toHaveBeenCalledWith(
            MATCH_ID,
            VIDEO_KEY,
            ['pending'],
            {
                analysisStatus: 'running',
                analysisError: null,
                analysisResult: null,
            },
        );
    });

    it('does not fail when the result was for a replaced video (nothing updated)', async () => {
        const { service } = setup(false);

        await expect(service.apply(result('done'))).resolves.toBeUndefined();
    });
});
