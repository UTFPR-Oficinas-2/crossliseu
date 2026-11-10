import type { FightState } from '../../matches/fight/fight-state.js';
import {
    errorFrame,
    parseFrame,
    parseHello,
    parseSurrender,
    stateFrame,
    welcomeFrame,
} from './arena-protocol.js';

describe('parseFrame', () => {
    it('reads event and data', () => {
        expect(parseFrame('{"event":"hello","data":{"a":1}}')).toEqual({
            event: 'hello',
            data: { a: 1 },
        });
    });

    it('accepts a frame without data', () => {
        expect(parseFrame('{"event":"x"}')).toEqual({
            event: 'x',
            data: undefined,
        });
    });

    it.each([
        'not json',
        '[]',
        'null',
        '"hello"',
        '{"data":{}}',
        '{"event":3}',
        '{"event":""}',
    ])('rejects %s', (text) => {
        expect(parseFrame(text)).toBeNull();
    });
});

describe('parseHello', () => {
    const valid = { deviceId: 'arena-01-ab12', token: 't', protocol: 1 };

    it('keeps the three fields and drops unknown ones', () => {
        expect(parseHello({ ...valid, extra: true })).toEqual(valid);
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
        ['a string', 'x'],
        ['a missing token', { deviceId: 'arena-01-ab12', protocol: 1 }],
        ['a numeric deviceId', { ...valid, deviceId: 5 }],
        ['a string protocol', { ...valid, protocol: '1' }],
        ['a fractional protocol', { ...valid, protocol: 1.5 }],
    ])('rejects %s', (_label, data) => {
        expect(parseHello(data)).toBeNull();
    });

    it('parses an unsupported protocol (the session checks the version)', () => {
        expect(parseHello({ ...valid, protocol: 2 })).toEqual({
            ...valid,
            protocol: 2,
        });
    });
});

describe('frame builders', () => {
    it('builds welcome', () => {
        expect(JSON.parse(welcomeFrame('Arena 01'))).toEqual({
            event: 'welcome',
            data: { arenaName: 'Arena 01' },
        });
    });

    it('builds error', () => {
        expect(JSON.parse(errorFrame('bad_frame', 'Not JSON'))).toEqual({
            event: 'error',
            data: { code: 'bad_frame', message: 'Not JSON' },
        });
    });
});

describe('stateFrame', () => {
    it('gives the idle frame for null', () => {
        expect(JSON.parse(stateFrame(null))).toEqual({
            event: 'state',
            data: {
                status: 'idle',
                matchId: null,
                remainingMs: null,
                endReason: null,
                robots: null,
            },
        });
    });

    it('wraps a FightState unchanged', () => {
        const state: FightState = {
            status: 'paused',
            matchId: 'm',
            remainingMs: 94210,
            endReason: null,
            robots: { A: { name: 'Tritura' }, B: { name: 'Ferrugem' } },
        };

        expect(JSON.parse(stateFrame(state))).toEqual({
            event: 'state',
            data: state,
        });
    });
});

describe('parseSurrender', () => {
    it.each([[{ side: 'A', matchId: 'm' }], [{ side: 'B', matchId: null }]])(
        'accepts %j',
        (data) => {
            expect(parseSurrender(data)).toEqual(data);
        },
    );

    it.each([
        [null],
        [{}],
        [{ side: 'a', matchId: 'm' }],
        [{ side: 'C', matchId: 'm' }],
        [{ side: 'A' }],
        [{ side: 'A', matchId: 5 }],
        [['A', 'm']],
    ])('rejects %j', (data) => {
        expect(parseSurrender(data)).toBeNull();
    });
});
