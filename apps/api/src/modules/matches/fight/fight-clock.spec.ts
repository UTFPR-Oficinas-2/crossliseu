import { describe, expect, it } from 'vitest';
import type { MatchState } from '../entities/match.entity.js';
import type { MatchEventType } from '../entities/match-event.entity.js';
import {
    MATCH_DURATION_MS,
    remainingMs,
    timeOutAt,
    type ClockEvent,
} from './fight-clock.js';

const T0 = new Date('2026-11-09T14:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const ev = (type: MatchEventType, ms: number): ClockEvent => ({
    type,
    occurredAt: at(ms),
});

describe('remainingMs', () => {
    it('scheduled gives the full duration whatever now is', () => {
        expect(remainingMs('scheduled', [], at(0))).toBe(MATCH_DURATION_MS);
        expect(remainingMs('scheduled', [], at(999_999))).toBe(180_000);
    });

    it('ongoing without pause', () => {
        expect(remainingMs('ongoing', [ev('started', 0)], at(60_000))).toBe(
            120_000,
        );
    });

    it('a paused fight loses no time', () => {
        const events = [ev('started', 0), ev('paused', 60_000)];
        expect(remainingMs('paused', events, at(90_000))).toBe(120_000);
    });

    it('resumed fight discounts the pause', () => {
        const events = [
            ev('started', 0),
            ev('paused', 60_000),
            ev('resumed', 90_000),
        ];
        expect(remainingMs('ongoing', events, at(100_000))).toBe(110_000);
    });

    const severalPauses = [
        ev('started', 0),
        ev('paused', 10_000),
        ev('resumed', 20_000),
        ev('paused', 30_000),
        ev('resumed', 45_000),
    ];

    it('several pauses', () => {
        expect(remainingMs('ongoing', severalPauses, at(100_000))).toBe(
            105_000,
        );
    });

    it('events in any order give the same result', () => {
        const shuffled = [
            severalPauses[3],
            severalPauses[0],
            severalPauses[4],
            severalPauses[2],
            severalPauses[1],
        ];
        expect(remainingMs('ongoing', shuffled, at(100_000))).toBe(105_000);
    });

    it('ongoing past the end gives 0, never negative', () => {
        expect(remainingMs('ongoing', [ev('started', 0)], at(500_000))).toBe(0);
    });

    it('ongoing exactly at the end gives 0', () => {
        expect(remainingMs('ongoing', [ev('started', 0)], at(180_000))).toBe(0);
    });

    it('finished stops the clock at the finish', () => {
        const events = [ev('started', 0), ev('finished', 70_000)];
        expect(remainingMs('finished', events, at(9_000_000))).toBe(110_000);
    });

    it('finished from paused', () => {
        const events = [
            ev('started', 0),
            ev('paused', 60_000),
            ev('finished', 80_000),
        ];
        expect(remainingMs('finished', events, at(9_000_000))).toBe(120_000);
    });

    it('ignores scored and closed events', () => {
        const events = [
            ev('started', 0),
            ev('scored', 10_000),
            ev('closed', 20_000),
        ];
        expect(remainingMs('ongoing', events, at(60_000))).toBe(120_000);
    });

    it('a fresh computation from stored events gives the same value', () => {
        const state: MatchState = 'ongoing';
        const a = remainingMs(state, severalPauses, at(100_000));
        const b = remainingMs(state, [...severalPauses], at(100_000));
        expect(a).toBe(b);
    });
});

describe('remainingMs with a clock behind the start', () => {
    it('never exceeds the match duration', () => {
        expect(remainingMs('ongoing', [ev('started', 10_000)], at(5_000))).toBe(
            MATCH_DURATION_MS,
        );
    });
});

describe('timeOutAt', () => {
    it('adds the paused time to the duration', () => {
        const events = [
            ev('started', 0),
            ev('paused', 10_000),
            ev('resumed', 20_000),
        ];
        expect(timeOutAt('ongoing', events)).toEqual(at(190_000));
    });

    it('is null for scheduled, paused and finished', () => {
        const events = [ev('started', 0), ev('paused', 10_000)];
        expect(timeOutAt('scheduled', [])).toBeNull();
        expect(timeOutAt('paused', events)).toBeNull();
        expect(timeOutAt('finished', events)).toBeNull();
    });
});
