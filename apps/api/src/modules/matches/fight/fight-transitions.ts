import type { MatchEndReason, MatchState } from '../entities/match.entity.js';
import type { MatchEventType } from '../entities/match-event.entity.js';

export const FIGHT_COMMANDS = [
    'start',
    'pause',
    'resume',
    'finish',
    'close',
] as const;
export type FightCommand = (typeof FIGHT_COMMANDS)[number];

export interface FightTransition {
    /** The match state after the command; `close` keeps the match `finished` */
    to: MatchState;
    event: MatchEventType;
    /** Set by `finish` only */
    endReason?: MatchEndReason;
}

/** Null when the command is not allowed from this state */
export function transitionFor(
    command: FightCommand,
    state: MatchState,
    closed: boolean,
): FightTransition | null {
    switch (command) {
        case 'start':
            return state === 'scheduled'
                ? { to: 'ongoing', event: 'started' }
                : null;
        case 'pause':
            return state === 'ongoing'
                ? { to: 'paused', event: 'paused' }
                : null;
        case 'resume':
            return state === 'paused'
                ? { to: 'ongoing', event: 'resumed' }
                : null;
        case 'finish':
            return state === 'ongoing' || state === 'paused'
                ? { to: 'finished', event: 'finished', endReason: 'manual' }
                : null;
        case 'close':
            return state === 'finished' && !closed
                ? { to: 'finished', event: 'closed' }
                : null;
    }
}
