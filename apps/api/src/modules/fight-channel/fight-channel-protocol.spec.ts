import type { FightState } from '../matches/fight/fight-state.js';
import {
    parseAuth,
    parseFrame,
    pingFrame,
    stateFrame,
} from './fight-channel-protocol.js';

const MATCH_ID = '3f1c2b0e-6a4d-4c1e-9b7a-2d5e8f0a1b2c';

describe('parseFrame', () => {
    it('reads event and data', () => {
        expect(parseFrame('{"event":"auth","data":{"a":1}}')).toEqual({
            event: 'auth',
            data: { a: 1 },
        });
    });

    it.each(['not json', '[]', 'null', '{}', '{"event":""}', '{"event":1}'])(
        'returns null for %s',
        (text) => {
            expect(parseFrame(text)).toBeNull();
        },
    );
});

describe('parseAuth', () => {
    it('accepts a frame without a name', () => {
        expect(parseAuth({ matchId: MATCH_ID, token: 't' })).toEqual({
            ok: true,
            auth: { matchId: MATCH_ID, token: 't', name: null },
        });
    });

    it('keeps the name', () => {
        expect(
            parseAuth({ matchId: MATCH_ID, token: 't', name: 'Ref' }),
        ).toEqual({
            ok: true,
            auth: { matchId: MATCH_ID, token: 't', name: 'Ref' },
        });
    });

    it.each([
        ['non-object data', 'x'],
        ['null data', null],
        ['array data', []],
        ['a missing token', { matchId: MATCH_ID }],
        ['an empty token', { matchId: MATCH_ID, token: '' }],
        ['a non-string token', { matchId: MATCH_ID, token: 1 }],
        ['a non-string name', { matchId: MATCH_ID, token: 't', name: 3 }],
    ])('returns bad_credentials for %s', (_label, data) => {
        expect(parseAuth(data)).toEqual({
            ok: false,
            reason: 'bad_credentials',
        });
    });

    it.each([
        { matchId: 'nope', token: 't' },
        { matchId: 5, token: 't' },
        { token: 't' },
    ])('returns match_not_found for a bad matchId %j', (data) => {
        expect(parseAuth(data)).toEqual({
            ok: false,
            reason: 'match_not_found',
        });
    });
});

describe('frames', () => {
    it('stateFrame wraps the state', () => {
        const state: FightState = {
            status: 'ongoing',
            matchId: MATCH_ID,
            remainingMs: 0,
            endReason: null,
            robots: { A: { name: 'a' }, B: { name: 'b' } },
        };
        expect(stateFrame(state)).toBe(
            JSON.stringify({ event: 'state', data: state }),
        );
    });

    it('pingFrame is a ping with null data', () => {
        expect(pingFrame()).toBe('{"event":"ping","data":null}');
    });
});
