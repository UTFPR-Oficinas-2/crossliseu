import { describe, expect, it } from 'vitest';
import type {
    AnalysisStatus,
    MatchVideo,
} from './entities/match-video.entity.js';
import { publicAnalysis, signedRead } from './public-analysis.js';
import { RecordingStorage } from './recording-storage.js';

const NOW = new Date('2026-11-27T12:00:00Z');
const COMBINED = 'analyses/m/heatmap_combined.png';

class FakeStorage extends RecordingStorage {
    signed: { key: string; expiresIn: number }[] = [];
    presignUpload(): Promise<string> {
        throw new Error('not used');
    }
    async presignDownload(key: string, expiresIn: number) {
        this.signed.push({ key, expiresIn });
        return `https://r2/${key}`;
    }
    objectSize(): Promise<number | null> {
        throw new Error('not used');
    }
    deleteObject(): Promise<void> {
        throw new Error('not used');
    }
}

function video(
    analysisStatus: AnalysisStatus,
    analysisResult: Record<string, unknown> | null = null,
    analysisError: string | null = null,
): MatchVideo {
    return { analysisStatus, analysisResult, analysisError } as MatchVideo;
}

const DONE_RESULT = {
    mock: false,
    totalFrames: 3990,
    combinedHeatmapKey: COMBINED,
    robots: {
        A: {
            detectedPositions: 1284,
            heatmapKey: 'analyses/m/heatmap_robot1.png',
        },
        B: {
            detectedPositions: 1131,
            heatmapKey: 'analyses/m/heatmap_robot2.png',
        },
    },
};

const EMPTY = {
    heatmapUrl: null,
    expiresAt: null,
    totalFrames: null,
    detectedPositions: { A: null, B: null },
};

describe('signedRead', () => {
    it('signs a GET for READ_URL_TTL_SECONDS and says when it ends', async () => {
        const storage = new FakeStorage();

        expect(await signedRead(storage, COMBINED, NOW)).toEqual({
            url: `https://r2/${COMBINED}`,
            expiresAt: '2026-11-27T12:15:00.000Z',
        });
        expect(storage.signed).toEqual([{ key: COMBINED, expiresIn: 900 }]);
    });
});

describe('publicAnalysis', () => {
    it('has no status when no video was confirmed', async () => {
        expect(await publicAnalysis(null, new FakeStorage(), NOW)).toEqual({
            status: null,
            ...EMPTY,
        });
    });

    it.each(['pending', 'running', 'failed'] as const)(
        'gives only the status while %s, never the error',
        async (status) => {
            const storage = new FakeStorage();

            const analysis = await publicAnalysis(
                video(status, null, 'video_unreadable'),
                storage,
                NOW,
            );

            expect(analysis).toEqual({ status, ...EMPTY });
            expect(storage.signed).toEqual([]);
        },
    );

    it('signs the combined heatmap once done', async () => {
        const storage = new FakeStorage();

        expect(
            await publicAnalysis(video('done', DONE_RESULT), storage, NOW),
        ).toEqual({
            status: 'done',
            heatmapUrl: `https://r2/${COMBINED}`,
            expiresAt: '2026-11-27T12:15:00.000Z',
            totalFrames: 3990,
            detectedPositions: { A: 1284, B: 1131 },
        });
        // Never the per-robot maps
        expect(storage.signed.map((s) => s.key)).toEqual([COMBINED]);
    });

    it('has no link when the done result has no combined heatmap', async () => {
        const storage = new FakeStorage();
        const { combinedHeatmapKey: _, ...withoutCombined } = DONE_RESULT;

        expect(
            await publicAnalysis(video('done', withoutCombined), storage, NOW),
        ).toEqual({
            status: 'done',
            heatmapUrl: null,
            expiresAt: null,
            totalFrames: 3990,
            detectedPositions: { A: 1284, B: 1131 },
        });
        expect(storage.signed).toEqual([]);
    });
});
