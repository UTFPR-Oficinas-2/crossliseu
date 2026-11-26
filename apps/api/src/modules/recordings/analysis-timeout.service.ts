import {
    Injectable,
    Logger,
    OnApplicationBootstrap,
    OnModuleDestroy,
} from '@nestjs/common';
import { MatchVideosRepository } from './match-videos.repository.js';

/** Past the CV worker's own 20-min limit plus slack, so the worker's report normally wins */
export const RUNNING_TIMEOUT_MS = 45 * 60_000;
/** Long enough for a fight waiting its turn behind a queue of others on the single worker */
export const PENDING_TIMEOUT_MS = 6 * 60 * 60_000;
export const SWEEP_INTERVAL_MS = 5 * 60_000;

/**
 * Fails analyses the CV worker never finished (#133): `running` for over 45 min or `pending` for
 * over 6 h become failed with processing_timeout, so the web app stops showing them as running.
 * The worker kills a job itself after 20 min; this catches what it cannot report, such as a worker
 * that is down or a result that was lost. A late result for a swept analysis is ignored
 * (AnalysisResultsService only moves analyses that are still pending or running).
 */
@Injectable()
export class AnalysisTimeoutService
    implements OnApplicationBootstrap, OnModuleDestroy
{
    private readonly logger = new Logger(AnalysisTimeoutService.name);
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor(private readonly videos: MatchVideosRepository) {}

    onApplicationBootstrap() {
        this.timer = setInterval(() => {
            this.sweep().catch((error: unknown) =>
                this.logger.error('analysis_sweep_failed', {
                    error: String(error),
                }),
            );
        }, SWEEP_INTERVAL_MS);
        // Never keeps the process alive on its own
        this.timer.unref();
    }

    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    /** Fails the stale analyses as of `now`; returns how many */
    async sweep(now: Date = new Date()): Promise<number> {
        const failed = await this.videos.failStaleAnalyses(
            new Date(now.getTime() - RUNNING_TIMEOUT_MS),
            new Date(now.getTime() - PENDING_TIMEOUT_MS),
        );
        for (const { matchId, previousStatus } of failed) {
            this.logger.warn('analysis_timed_out', { matchId, previousStatus });
        }
        return failed.length;
    }
}
