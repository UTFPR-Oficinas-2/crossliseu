import { proposeResult, surrenderedSide } from './fight-result.js';

describe('proposeResult', () => {
    it('a surrender of side A proposes B', () => {
        expect(
            proposeResult({
                endReason: 'surrender',
                surrenderedSide: 'A',
                totals: { A: 0, B: 0 },
            }),
        ).toEqual({ outcome: 'B', basis: 'surrender' });
    });

    it('a surrender of side B proposes A', () => {
        expect(
            proposeResult({
                endReason: 'surrender',
                surrenderedSide: 'B',
                totals: { A: 0, B: 0 },
            }),
        ).toEqual({ outcome: 'A', basis: 'surrender' });
    });

    it('a surrender ignores the points', () => {
        expect(
            proposeResult({
                endReason: 'surrender',
                surrenderedSide: 'A',
                totals: { A: 9, B: 0 },
            }),
        ).toEqual({ outcome: 'B', basis: 'surrender' });
    });

    it('a time-out proposes the side with more points', () => {
        expect(
            proposeResult({
                endReason: 'time_out',
                surrenderedSide: null,
                totals: { A: 5, B: 3 },
            }),
        ).toEqual({ outcome: 'A', basis: 'points' });
    });

    it('a manual finish proposes the side with more points', () => {
        expect(
            proposeResult({
                endReason: 'manual',
                surrenderedSide: null,
                totals: { A: 1, B: 4 },
            }),
        ).toEqual({ outcome: 'B', basis: 'points' });
    });

    it('equal points propose a draw', () => {
        expect(
            proposeResult({
                endReason: 'time_out',
                surrenderedSide: null,
                totals: { A: 3, B: 3 },
            }),
        ).toEqual({ outcome: 'draw', basis: 'tied' });
    });

    it('no points at all propose a draw', () => {
        expect(
            proposeResult({
                endReason: 'manual',
                surrenderedSide: null,
                totals: { A: 0, B: 0 },
            }),
        ).toEqual({ outcome: 'draw', basis: 'tied' });
    });

    it('a surrender without the surrendered side is a bug', () => {
        expect(() =>
            proposeResult({
                endReason: 'surrender',
                surrenderedSide: null,
                totals: { A: 0, B: 0 },
            }),
        ).toThrow();
    });
});

describe('surrenderedSide', () => {
    const robots = { robotAId: 'a', robotBId: 'b' };

    it('names the side of the robot that gave up', () => {
        expect(surrenderedSide({ ...robots, surrenderedRobotId: 'a' })).toBe(
            'A',
        );
        expect(surrenderedSide({ ...robots, surrenderedRobotId: 'b' })).toBe(
            'B',
        );
    });

    it('is null when nobody surrendered or the robot is not in the fight', () => {
        expect(
            surrenderedSide({ ...robots, surrenderedRobotId: null }),
        ).toBeNull();
        expect(
            surrenderedSide({ ...robots, surrenderedRobotId: 'other' }),
        ).toBeNull();
    });
});
