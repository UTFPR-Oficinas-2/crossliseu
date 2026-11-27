import { describe, expect, it } from 'vitest';
import { readAnalysisResult } from './analysis-result.js';

describe('readAnalysisResult', () => {
    it('reads the worker message', () => {
        expect(
            readAnalysisResult({
                mock: false,
                totalFrames: 300,
                trajectoriesKey: 'analyses/m/trajectories.csv',
                robots: {
                    A: {
                        detectedPositions: 290,
                        totalFrames: 300,
                        heatmapKey: 'analyses/m/heatmap_robot1.png',
                    },
                    B: {
                        detectedPositions: 0,
                        totalFrames: 300,
                        heatmapKey: null,
                    },
                },
            }),
        ).toEqual({
            mock: false,
            totalFrames: 300,
            combinedHeatmapKey: null,
            robots: [
                {
                    side: 'A',
                    detectedPositions: 290,
                    heatmapKey: 'analyses/m/heatmap_robot1.png',
                },
                { side: 'B', detectedPositions: 0, heatmapKey: null },
            ],
        });
    });

    it('returns null for something that is not an object', () => {
        expect(readAnalysisResult(null)).toBeNull();
        expect(readAnalysisResult('done')).toBeNull();
        expect(readAnalysisResult([])).toBeNull();
    });

    it('turns odd fields into null instead of failing', () => {
        expect(
            readAnalysisResult({
                totalFrames: -1,
                robots: { A: { detectedPositions: 'many' }, C: {} },
            }),
        ).toEqual({
            mock: false,
            totalFrames: null,
            combinedHeatmapKey: null,
            robots: [{ side: 'A', detectedPositions: null, heatmapKey: null }],
        });
    });

    it('never hands out a key outside analyses/ (the API would sign it)', () => {
        const read = readAnalysisResult({
            robots: { A: { heatmapKey: 'recordings/m/other.mp4' } },
        });

        expect(read?.robots[0].heatmapKey).toBeNull();
    });

    it('reads the combined heatmap key', () => {
        expect(
            readAnalysisResult({
                robots: {},
                combinedHeatmapKey: 'analyses/m/heatmap_combined.png',
            })?.combinedHeatmapKey,
        ).toBe('analyses/m/heatmap_combined.png');
    });

    it('drops a combined key outside analyses/', () => {
        for (const combinedHeatmapKey of [
            'recordings/m/a.mp4',
            42,
            undefined,
        ]) {
            expect(
                readAnalysisResult({ robots: {}, combinedHeatmapKey })
                    ?.combinedHeatmapKey,
            ).toBeNull();
        }
    });
});
