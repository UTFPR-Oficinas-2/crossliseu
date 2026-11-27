import { describe, expect, it } from 'vitest';
import type { Match } from '../matches/entities/match.entity.js';
import type { PublicAnalysis } from '../recordings/public-analysis.js';
import {
    fightResult,
    resultSummary,
    type ResultEvent,
} from './fight-result-view.js';

const T0 = Date.parse('2026-12-09T15:12:00Z');
const at = (s: number) => new Date(T0 + s * 1000);

function match(over: Partial<Match> = {}): Match {
    return {
        id: 'm1',
        championshipId: 'c1',
        weightClass: 'beetleweight',
        robotAId: 'ra',
        robotBId: 'rb',
        robotA: { id: 'ra', name: 'Aço' },
        robotB: { id: 'rb', name: 'Faísca' },
        state: 'finished',
        endReason: 'manual',
        winnerRobotId: null,
        draw: false,
        surrenderedRobotId: null,
        ...over,
    } as Match;
}

const ev = (type: ResultEvent['type'], s: number): ResultEvent => ({
    type,
    occurredAt: at(s),
    robotId: null,
    judgeSeat: null,
    action: null,
});
const score = (robotId: string, action: 1 | -1): ResultEvent => ({
    type: 'scored',
    occurredAt: at(10),
    robotId,
    judgeSeat: 1,
    action,
});

const fought = [ev('started', 0), ev('finished', 120), ev('closed', 150)];
const ANALYSIS: PublicAnalysis = {
    status: 'running',
    heatmapUrl: null,
    expiresAt: null,
    totalFrames: null,
    detectedPositions: { A: null, B: null },
};

describe('resultSummary', () => {
    it('is null until the fight is closed', () => {
        const unclosed = [ev('started', 0), ev('finished', 120)];

        expect(resultSummary(match(), unclosed)).toBeNull();
        expect(fightResult(match(), unclosed, ANALYSIS)).toBeNull();
    });

    it('gives the winner as a side', () => {
        expect(resultSummary(match({ winnerRobotId: 'rb' }), fought)).toEqual({
            matchId: 'm1',
            championshipId: 'c1',
            weightClass: 'beetleweight',
            closedAt: at(150).toISOString(),
            robots: {
                A: { id: 'ra', name: 'Aço' },
                B: { id: 'rb', name: 'Faísca' },
            },
            winnerSide: 'B',
            draw: false,
            endReason: 'manual',
            surrenderedSide: null,
        });
    });

    it('gives the side that surrendered and the other side as winner', () => {
        const summary = resultSummary(
            match({
                endReason: 'surrender',
                surrenderedRobotId: 'ra',
                winnerRobotId: 'rb',
            }),
            fought,
        );

        expect(summary).toMatchObject({
            endReason: 'surrender',
            surrenderedSide: 'A',
            winnerSide: 'B',
        });
    });

    it('reports a draw without a winner', () => {
        expect(resultSummary(match({ draw: true }), fought)).toMatchObject({
            winnerSide: null,
            draw: true,
        });
    });
});

describe('fightResult', () => {
    it('sums the points of every referee per side', () => {
        const events = [
            ...fought,
            score('ra', 1),
            score('ra', 1),
            score('ra', 1),
            score('ra', -1),
            ...Array.from({ length: 5 }, () => score('rb', 1)),
        ];

        expect(fightResult(match(), events, ANALYSIS)?.score).toEqual({
            A: 2,
            B: 5,
        });
    });

    it('counts only the time fought, without pauses', () => {
        const events = [
            ev('started', 0),
            ev('paused', 30),
            ev('resumed', 90),
            ev('finished', 120),
            ev('closed', 200),
        ];

        expect(fightResult(match(), events, ANALYSIS)).toMatchObject({
            startedAt: at(0).toISOString(),
            closedAt: at(200).toISOString(),
            durationMs: 60_000,
        });
    });

    it('never counts more than the full three minutes', () => {
        const events = [
            ev('started', 0),
            ev('finished', 400),
            ev('closed', 500),
        ];

        expect(
            fightResult(match({ endReason: 'time_out' }), events, ANALYSIS)
                ?.durationMs,
        ).toBe(180_000);
    });

    it('carries the analysis as given', () => {
        expect(fightResult(match(), fought, ANALYSIS)?.analysis).toBe(ANALYSIS);
    });
});
