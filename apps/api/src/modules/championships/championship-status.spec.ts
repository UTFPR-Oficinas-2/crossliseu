import { championshipStatus } from './championship-status.js';

const d = (iso: string) => new Date(iso);
const now = d('2026-11-04T12:00:00Z');

describe('championshipStatus', () => {
    it('is scheduled before the start day', () => {
        expect(
            championshipStatus(
                d('2026-11-05T00:00:00Z'),
                d('2026-11-06T00:00:00Z'),
                now,
            ),
        ).toBe('scheduled');
    });

    it('is ongoing on the start day', () => {
        expect(
            championshipStatus(
                d('2026-11-04T23:00:00Z'),
                d('2026-11-06T00:00:00Z'),
                now,
            ),
        ).toBe('ongoing');
    });

    it('is ongoing on the end day', () => {
        expect(
            championshipStatus(
                d('2026-11-01T00:00:00Z'),
                d('2026-11-04T00:00:00Z'),
                now,
            ),
        ).toBe('ongoing');
    });

    it('is closed after the end day', () => {
        expect(
            championshipStatus(
                d('2026-11-01T00:00:00Z'),
                d('2026-11-03T23:59:59Z'),
                now,
            ),
        ).toBe('closed');
    });
});
