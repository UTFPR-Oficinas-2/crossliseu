import type { MatchEvent } from '../matches/entities/match-event.entity.js';
import type {
    Match,
    MatchEndReason,
} from '../matches/entities/match.entity.js';
import {
    MATCH_DURATION_MS,
    remainingMs,
} from '../matches/fight/fight-clock.js';
import {
    scoreTotals,
    type Side,
    type SideCounts,
} from '../matches/fight/score.js';
import type { PublicAnalysis } from '../recordings/public-analysis.js';

/** What the result needs from each event: the clock, the `closed` marker and the scores */
export type ResultEvent = Pick<
    MatchEvent,
    'type' | 'occurredAt' | 'robotId' | 'judgeSeat' | 'action'
>;

interface RobotRef {
    id: string;
    name: string;
}

/** One row of a championship's results (PUB-08) */
export interface ResultSummary {
    matchId: string;
    championshipId: string;
    weightClass: string;
    /** When the operator confirmed the result */
    closedAt: string;
    robots: { A: RobotRef; B: RobotRef };
    winnerSide: Side | null;
    draw: boolean;
    endReason: MatchEndReason | null;
    surrenderedSide: Side | null;
}

/** A confirmed fight's result page (PUB-03 / PUB-04) */
export interface FightResult extends ResultSummary {
    startedAt: string | null;
    /** Time actually fought: pauses left out, never above MATCH_DURATION_MS */
    durationMs: number;
    /** Points per side summed over the three referees; never one referee's */
    score: SideCounts;
    analysis: PublicAnalysis;
}

function eventAt(events: readonly ResultEvent[], type: ResultEvent['type']) {
    return events.find((event) => event.type === type)?.occurredAt ?? null;
}

function sideOf(match: Match, robotId: string | null): Side | null {
    if (robotId === match.robotAId) return 'A';
    if (robotId === match.robotBId) return 'B';
    return null;
}

/**
 * The public summary of a fight, or null while it is not closed: only results the operator
 * confirmed are public (#22). `match` needs `robotA` and `robotB` loaded.
 */
export function resultSummary(
    match: Match,
    events: readonly ResultEvent[],
): ResultSummary | null {
    const closedAt = eventAt(events, 'closed');
    if (!closedAt) return null;

    return {
        matchId: match.id,
        championshipId: match.championshipId,
        weightClass: match.weightClass,
        closedAt: closedAt.toISOString(),
        robots: {
            A: { id: match.robotAId, name: match.robotA?.name ?? '' },
            B: { id: match.robotBId, name: match.robotB?.name ?? '' },
        },
        winnerSide: sideOf(match, match.winnerRobotId),
        draw: match.draw,
        endReason: match.endReason,
        surrenderedSide: sideOf(match, match.surrenderedRobotId),
    };
}

/** The full result of a closed fight, or null while it is not closed */
export function fightResult(
    match: Match,
    events: readonly ResultEvent[],
    analysis: PublicAnalysis,
): FightResult | null {
    const summary = resultSummary(match, events);
    if (!summary) return null;

    const startedAt = eventAt(events, 'started');
    return {
        ...summary,
        startedAt: startedAt?.toISOString() ?? null,
        durationMs:
            MATCH_DURATION_MS -
            remainingMs('finished', events, new Date(summary.closedAt)),
        score: scoreTotals(events, { A: match.robotAId, B: match.robotBId }),
        analysis,
    };
}
