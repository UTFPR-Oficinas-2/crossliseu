import type { MatchState } from '../entities/match.entity.js';
import type { MatchEvent } from '../entities/match-event.entity.js';

export const MATCH_DURATION_MS = 180_000;

export type ClockEvent = Pick<MatchEvent, 'type' | 'occurredAt'>;

/** The events that move the clock, oldest first; `scored` and `closed` do not matter here */
function clockEvents(events: readonly ClockEvent[]): ClockEvent[] {
    return events
        .filter((e) =>
            ['started', 'paused', 'resumed', 'finished'].includes(e.type),
        )
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

/** Total paused time up to `end`; each `paused` pairs with the next `resumed`, an unpaired one runs to `end` */
function pausedTotalMs(sorted: readonly ClockEvent[], end: number): number {
    let total = 0;
    let pausedAt: number | null = null;
    for (const e of sorted) {
        if (e.type === 'paused' && pausedAt === null) {
            pausedAt = e.occurredAt.getTime();
        } else if (e.type === 'resumed' && pausedAt !== null) {
            total += e.occurredAt.getTime() - pausedAt;
            pausedAt = null;
        }
    }
    if (pausedAt !== null) {
        total += Math.max(0, end - pausedAt);
    }
    return total;
}

/** Time left for a match in `state`, from its events in any order; never below 0 */
export function remainingMs(
    state: MatchState,
    events: readonly ClockEvent[],
    now: Date,
): number {
    if (state === 'scheduled') {
        return MATCH_DURATION_MS;
    }
    const sorted = clockEvents(events);
    const started = sorted.find((e) => e.type === 'started');
    if (!started) {
        return MATCH_DURATION_MS;
    }

    let end = now.getTime();
    if (state === 'paused') {
        const lastPause = sorted.findLast((e) => e.type === 'paused');
        end = lastPause ? lastPause.occurredAt.getTime() : end;
    } else if (state === 'finished') {
        const finished = sorted.find((e) => e.type === 'finished');
        end = finished ? finished.occurredAt.getTime() : end;
    }

    // A clock stepped back can put `end` before the start: never more than the full duration
    const elapsed = Math.max(
        0,
        end - started.occurredAt.getTime() - pausedTotalMs(sorted, end),
    );
    return Math.max(0, MATCH_DURATION_MS - elapsed);
}

/** For an `ongoing` match: the instant time runs (or ran) out. Null for any other state. */
export function timeOutAt(
    state: MatchState,
    events: readonly ClockEvent[],
): Date | null {
    if (state !== 'ongoing') {
        return null;
    }
    const sorted = clockEvents(events);
    const started = sorted.find((e) => e.type === 'started');
    if (!started) {
        return null;
    }
    // While ongoing every pause is closed, so no end is needed
    const paused = pausedTotalMs(sorted, started.occurredAt.getTime());
    return new Date(started.occurredAt.getTime() + MATCH_DURATION_MS + paused);
}
