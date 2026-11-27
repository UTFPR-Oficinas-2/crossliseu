import { readAnalysisResult, type Side } from './analysis-result.js';
import type {
    AnalysisStatus,
    MatchVideo,
} from './entities/match-video.entity.js';
import type { RecordingStorage } from './recording-storage.js';

/** How long a read URL works: enough to start playing or downloading; ask again for a new one */
export const READ_URL_TTL_SECONDS = 15 * 60;

/**
 * The analysis as the public result page shows it (#22): one status per fight and the combined
 * heatmap only. Never the worker's error code nor the per-robot maps.
 */
export interface PublicAnalysis {
    /** null when no video was confirmed for the fight */
    status: AnalysisStatus | null;
    /** Only once done and the worker drew the combined map, so the page never gets a broken link */
    heatmapUrl: string | null;
    /** When `heatmapUrl` stops working (ISO); null without one */
    expiresAt: string | null;
    totalFrames: number | null;
    detectedPositions: Record<Side, number | null>;
}

/** A presigned GET of `key`, valid for READ_URL_TTL_SECONDS, with when it ends */
export async function signedRead(
    storage: RecordingStorage,
    key: string,
    now: Date,
): Promise<{ url: string; expiresAt: string }> {
    return {
        url: await storage.presignDownload(key, READ_URL_TTL_SECONDS),
        expiresAt: new Date(
            now.getTime() + READ_URL_TTL_SECONDS * 1000,
        ).toISOString(),
    };
}

export async function publicAnalysis(
    video: MatchVideo | null,
    storage: RecordingStorage,
    now: Date,
): Promise<PublicAnalysis> {
    const status = video?.analysisStatus ?? null;
    const result =
        status === 'done' ? readAnalysisResult(video?.analysisResult) : null;
    const positions = (side: Side) =>
        result?.robots.find((robot) => robot.side === side)
            ?.detectedPositions ?? null;
    const heatmap = result?.combinedHeatmapKey
        ? await signedRead(storage, result.combinedHeatmapKey, now)
        : null;

    return {
        status,
        heatmapUrl: heatmap?.url ?? null,
        expiresAt: heatmap?.expiresAt ?? null,
        totalFrames: result?.totalFrames ?? null,
        detectedPositions: { A: positions('A'), B: positions('B') },
    };
}
