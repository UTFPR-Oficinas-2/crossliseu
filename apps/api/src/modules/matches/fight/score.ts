import type { JudgeSeat, MatchEvent } from '../entities/match-event.entity.js';

export type Side = 'A' | 'B';
export type SideCounts = { A: number; B: number };
export type ScoreEvent = Pick<
    MatchEvent,
    'type' | 'robotId' | 'judgeSeat' | 'action'
>;

/** Sum of `scored` actions per side, over every seat or only `seat` */
function sum(
    events: readonly ScoreEvent[],
    robots: { A: string; B: string },
    seat: JudgeSeat | null,
): SideCounts {
    const counts: SideCounts = { A: 0, B: 0 };
    for (const event of events) {
        if (
            event.type !== 'scored' ||
            event.action === null ||
            (seat !== null && event.judgeSeat !== seat)
        ) {
            continue;
        }
        if (event.robotId === robots.A) {
            counts.A += event.action;
        } else if (event.robotId === robots.B) {
            counts.B += event.action;
        }
    }
    return counts;
}

/** The points of each side across the three referees: the only score shared screens show */
export function scoreTotals(
    events: readonly ScoreEvent[],
    robots: { A: string; B: string },
): SideCounts {
    return sum(events, robots, null);
}

/** One referee's own points per side: shown only on that referee's phone */
export function seatCounts(
    events: readonly ScoreEvent[],
    robots: { A: string; B: string },
    seat: JudgeSeat,
): SideCounts {
    return sum(events, robots, seat);
}
