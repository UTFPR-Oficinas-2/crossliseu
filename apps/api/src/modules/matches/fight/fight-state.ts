import type { MatchEndReason, MatchState } from '../entities/match.entity.js';
import type { SideCounts } from './score.js';

/** Same shape as the data of the /arena `state` message */
export interface FightState {
    status: MatchState;
    matchId: string;
    remainingMs: number;
    endReason: MatchEndReason | null;
    robots: { A: { name: string }; B: { name: string } };
    /** Points per side, summed over the three referees; never one referee's partial */
    score: SideCounts;
}
