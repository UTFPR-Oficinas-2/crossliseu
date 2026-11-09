import type { MatchEndReason, MatchState } from '../entities/match.entity.js';

/** Same shape as the data of the /arena `state` message */
export interface FightState {
    status: MatchState;
    matchId: string;
    remainingMs: number;
    endReason: MatchEndReason | null;
    robots: { A: { name: string }; B: { name: string } };
}
