import { describe, expect, it } from 'vitest';
import type { MatchState } from '../entities/match.entity.js';
import {
    FIGHT_COMMANDS,
    transitionFor,
    type FightCommand,
    type FightTransition,
} from './fight-transitions.js';

const STATES: MatchState[] = ['scheduled', 'ongoing', 'paused', 'finished'];

const STARTED: FightTransition = { to: 'ongoing', event: 'started' };
const PAUSED: FightTransition = { to: 'paused', event: 'paused' };
const RESUMED: FightTransition = { to: 'ongoing', event: 'resumed' };
const FINISHED: FightTransition = {
    to: 'finished',
    event: 'finished',
    endReason: 'manual',
};
const CLOSED: FightTransition = { to: 'finished', event: 'closed' };

interface Case {
    command: FightCommand;
    state: MatchState;
    closed: boolean;
    expected: FightTransition | null;
}

/** Every (command, state, closed) combination: 5 x 4 x 2 = 40 cases */
const cases: Case[] = [
    // start
    { command: 'start', state: 'scheduled', closed: false, expected: STARTED },
    { command: 'start', state: 'scheduled', closed: true, expected: STARTED },
    { command: 'start', state: 'ongoing', closed: false, expected: null },
    { command: 'start', state: 'ongoing', closed: true, expected: null },
    { command: 'start', state: 'paused', closed: false, expected: null },
    { command: 'start', state: 'paused', closed: true, expected: null },
    { command: 'start', state: 'finished', closed: false, expected: null },
    { command: 'start', state: 'finished', closed: true, expected: null },
    // pause
    { command: 'pause', state: 'scheduled', closed: false, expected: null },
    { command: 'pause', state: 'scheduled', closed: true, expected: null },
    { command: 'pause', state: 'ongoing', closed: false, expected: PAUSED },
    { command: 'pause', state: 'ongoing', closed: true, expected: PAUSED },
    { command: 'pause', state: 'paused', closed: false, expected: null },
    { command: 'pause', state: 'paused', closed: true, expected: null },
    { command: 'pause', state: 'finished', closed: false, expected: null },
    { command: 'pause', state: 'finished', closed: true, expected: null },
    // resume
    { command: 'resume', state: 'scheduled', closed: false, expected: null },
    { command: 'resume', state: 'scheduled', closed: true, expected: null },
    { command: 'resume', state: 'ongoing', closed: false, expected: null },
    { command: 'resume', state: 'ongoing', closed: true, expected: null },
    { command: 'resume', state: 'paused', closed: false, expected: RESUMED },
    { command: 'resume', state: 'paused', closed: true, expected: RESUMED },
    { command: 'resume', state: 'finished', closed: false, expected: null },
    { command: 'resume', state: 'finished', closed: true, expected: null },
    // finish
    { command: 'finish', state: 'scheduled', closed: false, expected: null },
    { command: 'finish', state: 'scheduled', closed: true, expected: null },
    { command: 'finish', state: 'ongoing', closed: false, expected: FINISHED },
    { command: 'finish', state: 'ongoing', closed: true, expected: FINISHED },
    { command: 'finish', state: 'paused', closed: false, expected: FINISHED },
    { command: 'finish', state: 'paused', closed: true, expected: FINISHED },
    { command: 'finish', state: 'finished', closed: false, expected: null },
    { command: 'finish', state: 'finished', closed: true, expected: null },
    // close
    { command: 'close', state: 'scheduled', closed: false, expected: null },
    { command: 'close', state: 'scheduled', closed: true, expected: null },
    { command: 'close', state: 'ongoing', closed: false, expected: null },
    { command: 'close', state: 'ongoing', closed: true, expected: null },
    { command: 'close', state: 'paused', closed: false, expected: null },
    { command: 'close', state: 'paused', closed: true, expected: null },
    { command: 'close', state: 'finished', closed: false, expected: CLOSED },
    { command: 'close', state: 'finished', closed: true, expected: null },
];

describe('transitionFor', () => {
    it('covers every command, state and closed combination', () => {
        expect(cases).toHaveLength(FIGHT_COMMANDS.length * STATES.length * 2);
    });

    it.each(cases)(
        '$command from $state (closed: $closed) -> $expected',
        ({ command, state, closed, expected }) => {
            expect(transitionFor(command, state, closed)).toEqual(expected);
        },
    );
});
