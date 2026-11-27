/**
 * Reading `match_videos.analysis_result`: the CV worker's done message (apps/cv-worker/src/jobs.py),
 * stored as it came. It is jsonb written by another program, so every field is checked here and a
 * missing or odd one becomes null instead of breaking the response.
 *
 *   {"mock": bool, "totalFrames": int, "trajectoriesKey": str, "combinedHeatmapKey": str | null,
 *    "robots": {"A": {"detectedPositions": int, "totalFrames": int, "heatmapKey": str | null}, "B": …}}
 *
 * Side A is robot 1 (blue marker), side B robot 2 (red).
 */
export type Side = 'A' | 'B';
const SIDES: readonly Side[] = ['A', 'B'];

export interface RobotAnalysis {
    side: Side;
    detectedPositions: number | null;
    heatmapKey: string | null;
}

export interface StoredAnalysis {
    mock: boolean;
    totalFrames: number | null;
    /** Both robots on one map (#136); null when the worker drew none */
    combinedHeatmapKey: string | null;
    robots: RobotAnalysis[];
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function count(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
        ? value
        : null;
}

/** Only keys the worker writes; anything else would let the API sign an arbitrary object */
function heatmapKey(value: unknown): string | null {
    return typeof value === 'string' && value.startsWith('analyses/')
        ? value
        : null;
}

export function readAnalysisResult(raw: unknown): StoredAnalysis | null {
    if (!isObject(raw)) return null;
    const robots = isObject(raw.robots) ? raw.robots : {};
    return {
        mock: raw.mock === true,
        totalFrames: count(raw.totalFrames),
        combinedHeatmapKey: heatmapKey(raw.combinedHeatmapKey),
        robots: SIDES.filter((side) => isObject(robots[side])).map((side) => {
            const robot = robots[side] as Record<string, unknown>;
            return {
                side,
                detectedPositions: count(robot.detectedPositions),
                heatmapKey: heatmapKey(robot.heatmapKey),
            };
        }),
    };
}
