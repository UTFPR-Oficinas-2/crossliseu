import type { INestApplication } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { AnalysisResultsService } from '../src/modules/recordings/analysis-results.service.js';
import { AnalysisTimeoutService } from '../src/modules/recordings/analysis-timeout.service.js';
import {
    createTestApp,
    dataSourceOf,
    resetDatabase,
    seedChampionship,
    seedMatch,
    seedRobot,
} from './helpers.js';

const NOW = new Date('2026-11-25T12:00:00.000Z');

function minutesBefore(minutes: number): Date {
    return new Date(NOW.getTime() - minutes * 60_000);
}

describe('stale analyses (db, #133)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let sweeper: AnalysisTimeoutService;

    beforeAll(async () => {
        app = await createTestApp();
        ds = dataSourceOf(app);
        sweeper = app.get(AnalysisTimeoutService);
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await resetDatabase(ds);
    });

    /** A match whose video is `status`, with the analysis in `analysisStatus` since `since` */
    async function videoWith(
        analysisStatus: string | null,
        since: Date,
        status: 'uploaded' | 'uploading' = 'uploaded',
    ): Promise<{ matchId: string; videoKey: string }> {
        const championship = await seedChampionship(ds);
        const a = await seedRobot(ds, championship.id, { name: 'A' });
        const b = await seedRobot(ds, championship.id, { name: 'B' });
        const match = await seedMatch(ds, championship.id, a.id, b.id);
        const videoKey = `recordings/${match.id}/a.mp4`;
        await ds.query(
            `INSERT INTO "match_videos" ("match_id", "object_key", "content_type", "status",
                "uploaded_at", "uploaded_by_user_id", "analysis_status", "analysis_updated_at")
             VALUES ($1, $2, 'video/mp4', $3, $4, $5, $6, $4)`,
            [
                match.id,
                videoKey,
                status,
                since,
                match.createdByUserId,
                analysisStatus,
            ],
        );
        return { matchId: match.id, videoKey };
    }

    async function analysisOf(matchId: string) {
        const [row]: {
            analysis_status: string | null;
            analysis_error: string | null;
            analysis_updated_at: Date | null;
        }[] = await ds.query(
            `SELECT "analysis_status", "analysis_error", "analysis_updated_at"
             FROM "match_videos" WHERE "match_id" = $1`,
            [matchId],
        );
        return row!;
    }

    it('fails a running analysis past 45 min and a pending one past 6 h', async () => {
        const running = await videoWith('running', minutesBefore(46));
        const pending = await videoWith('pending', minutesBefore(7 * 60));

        expect(await sweeper.sweep(NOW)).toBe(2);

        for (const { matchId } of [running, pending]) {
            const analysis = await analysisOf(matchId);
            expect(analysis.analysis_status).toBe('failed');
            expect(analysis.analysis_error).toBe('processing_timeout');
            expect(analysis.analysis_updated_at!.getTime()).toBeGreaterThan(
                minutesBefore(1).getTime(),
            );
        }
    });

    it('counts a row with no analysis_updated_at from its upload', async () => {
        const stale = await videoWith('pending', minutesBefore(7 * 60));
        const fresh = await videoWith('pending', minutesBefore(5 * 60));
        await ds.query(
            `UPDATE "match_videos" SET "analysis_updated_at" = NULL`,
        );

        expect(await sweeper.sweep(NOW)).toBe(1);

        expect((await analysisOf(stale.matchId)).analysis_status).toBe(
            'failed',
        );
        expect((await analysisOf(fresh.matchId)).analysis_status).toBe(
            'pending',
        );
    });

    it('leaves fresh, finished and still-uploading analyses alone', async () => {
        const untouched = [
            await videoWith('running', minutesBefore(44)),
            await videoWith('pending', minutesBefore(5 * 60)),
            await videoWith('done', minutesBefore(7 * 60)),
            await videoWith('failed', minutesBefore(7 * 60)),
            await videoWith('running', minutesBefore(7 * 60), 'uploading'),
        ];
        const before = await Promise.all(
            untouched.map(({ matchId }) => analysisOf(matchId)),
        );

        expect(await sweeper.sweep(NOW)).toBe(0);

        const after = await Promise.all(
            untouched.map(({ matchId }) => analysisOf(matchId)),
        );
        expect(after).toEqual(before);
    });

    it('ignores a worker result that arrives after the sweep', async () => {
        const video = await videoWith('pending', minutesBefore(7 * 60));
        await sweeper.sweep(NOW);
        const results = app.get(AnalysisResultsService);

        await results.apply({ ...video, status: 'running', details: {} });
        await results.apply({ ...video, status: 'done', details: {} });

        expect(await analysisOf(video.matchId)).toMatchObject({
            analysis_status: 'failed',
            analysis_error: 'processing_timeout',
        });
    });

    it('a retried job reporting running again restarts the clock', async () => {
        const video = await videoWith('running', minutesBefore(40));

        await app
            .get(AnalysisResultsService)
            .apply({ ...video, status: 'running', details: {} });

        expect(await sweeper.sweep(new Date(Date.now() + 10 * 60_000))).toBe(0);
        expect((await analysisOf(video.matchId)).analysis_status).toBe(
            'running',
        );
    });

    it('a worker result moves the clock', async () => {
        const video = await videoWith('pending', minutesBefore(60));

        await app
            .get(AnalysisResultsService)
            .apply({ ...video, status: 'running', details: {} });

        const analysis = await analysisOf(video.matchId);
        expect(analysis.analysis_status).toBe('running');
        expect(analysis.analysis_updated_at!.getTime()).toBeGreaterThan(
            Date.now() - 60_000,
        );
    });
});
