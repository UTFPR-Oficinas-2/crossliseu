import { scoreTotals, seatCounts, type ScoreEvent } from './score.js';

const robots = { A: 'robot-a', B: 'robot-b' };

function scored(
    judgeSeat: 1 | 2 | 3,
    side: 'A' | 'B',
    action: 1 | -1,
): ScoreEvent {
    return { type: 'scored', robotId: robots[side], judgeSeat, action };
}

const events: ScoreEvent[] = [
    scored(1, 'A', 1),
    scored(2, 'A', 1),
    scored(3, 'B', 1),
    scored(1, 'A', -1),
];

describe('scoreTotals', () => {
    it('sums all seats per side', () => {
        expect(scoreTotals(events, robots)).toEqual({ A: 1, B: 1 });
    });

    it('ignores non-scored events', () => {
        expect(
            scoreTotals(
                [
                    {
                        type: 'started',
                        robotId: null,
                        judgeSeat: null,
                        action: null,
                    },
                    scored(1, 'B', 1),
                ],
                robots,
            ),
        ).toEqual({ A: 0, B: 1 });
    });

    it('is zero for a match without scores', () => {
        expect(scoreTotals([], robots)).toEqual({ A: 0, B: 0 });
    });
});

describe('seatCounts', () => {
    it('seatCounts keeps one seat only', () => {
        expect(seatCounts(events, robots, 1)).toEqual({ A: 0, B: 0 });
        expect(seatCounts(events, robots, 2)).toEqual({ A: 1, B: 0 });
        expect(seatCounts(events, robots, 3)).toEqual({ A: 0, B: 1 });
    });
});
