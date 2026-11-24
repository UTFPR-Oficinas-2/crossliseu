import type { MatchEndReason } from '../entities/match.entity.js';
import type { Side, SideCounts } from './score.js';

/** Why the result is proposed: a surrender, more points, or equal points */
export type ResultBasis = 'surrender' | 'points' | 'tied';

/** The result the operator confirms when closing a fight (#50) */
export interface ResultProposal {
    outcome: Side | 'draw';
    basis: ResultBasis;
}

/**
 * A surrender gives the fight to the other side; otherwise the side with more points over the
 * three referees wins, and equal points (including none) propose a draw.
 */
export function proposeResult(input: {
    endReason: MatchEndReason;
    surrenderedSide: Side | null;
    totals: SideCounts;
}): ResultProposal {
    const { endReason, surrenderedSide, totals } = input;
    if (endReason === 'surrender') {
        if (surrenderedSide === null) {
            throw new Error('A surrender must record the side that gave up');
        }
        return {
            outcome: surrenderedSide === 'A' ? 'B' : 'A',
            basis: 'surrender',
        };
    }
    if (totals.A === totals.B) {
        return { outcome: 'draw', basis: 'tied' };
    }
    return { outcome: totals.A > totals.B ? 'A' : 'B', basis: 'points' };
}

/** The side of the robot that gave up, or null when nobody did */
export function surrenderedSide(match: {
    robotAId: string;
    robotBId: string;
    surrenderedRobotId: string | null;
}): Side | null {
    if (match.surrenderedRobotId === null) {
        return null;
    }
    if (match.surrenderedRobotId === match.robotAId) {
        return 'A';
    }
    return match.surrenderedRobotId === match.robotBId ? 'B' : null;
}
