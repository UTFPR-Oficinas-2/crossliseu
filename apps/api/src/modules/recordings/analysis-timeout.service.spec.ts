import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AnalysisTimeoutService,
    PENDING_TIMEOUT_MS,
    RUNNING_TIMEOUT_MS,
    SWEEP_INTERVAL_MS,
} from './analysis-timeout.service.js';
import type { MatchVideosRepository } from './match-videos.repository.js';

const MATCH_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function setup(
    failStaleAnalyses: MatchVideosRepository['failStaleAnalyses'] = vi.fn(
        async () => [],
    ),
) {
    const videos = { failStaleAnalyses: vi.fn(failStaleAnalyses) };
    const service = new AnalysisTimeoutService(
        videos as unknown as MatchVideosRepository,
    );
    return { service, videos };
}

describe('AnalysisTimeoutService', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('uses the limits from the design: 45 min running, 6 h pending, every 5 min', () => {
        expect(RUNNING_TIMEOUT_MS).toBe(45 * 60_000);
        expect(PENDING_TIMEOUT_MS).toBe(6 * 60 * 60_000);
        expect(SWEEP_INTERVAL_MS).toBe(5 * 60_000);
    });

    it('fails running analyses older than 45 min and pending ones older than 6 h', async () => {
        const { service, videos } = setup();
        const now = new Date('2026-11-25T12:00:00.000Z');

        await service.sweep(now);

        expect(videos.failStaleAnalyses).toHaveBeenCalledWith(
            new Date('2026-11-25T11:15:00.000Z'),
            new Date('2026-11-25T06:00:00.000Z'),
        );
    });

    it('logs each analysis it failed and returns how many', async () => {
        const warn = vi
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const { service } = setup(async () => [
            { matchId: MATCH_ID, previousStatus: 'running' },
        ]);

        expect(await service.sweep()).toBe(1);
        expect(warn).toHaveBeenCalledWith('analysis_timed_out', {
            matchId: MATCH_ID,
            previousStatus: 'running',
        });
    });

    it('sweeps every 5 min after bootstrap, not before, and stops on destroy', async () => {
        const { service, videos } = setup();

        service.onApplicationBootstrap();
        expect(videos.failStaleAnalyses).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS);
        expect(videos.failStaleAnalyses).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS);
        expect(videos.failStaleAnalyses).toHaveBeenCalledTimes(2);

        service.onModuleDestroy();
        await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS * 3);
        expect(videos.failStaleAnalyses).toHaveBeenCalledTimes(2);
    });

    it('a sweep that fails is logged and the next one still runs', async () => {
        const error = vi
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        const { service, videos } = setup(
            vi
                .fn()
                .mockRejectedValueOnce(new Error('database down'))
                .mockResolvedValue([]),
        );

        service.onApplicationBootstrap();
        await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS);
        await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS);

        expect(error).toHaveBeenCalledWith(
            'analysis_sweep_failed',
            expect.objectContaining({
                error: expect.stringContaining('database down'),
            }),
        );
        expect(videos.failStaleAnalyses).toHaveBeenCalledTimes(2);
        service.onModuleDestroy();
    });
});
