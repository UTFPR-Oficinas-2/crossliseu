// Run with: node --test tools/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseConfigH,
    resolveOptions,
    formatTime,
    describeState,
    retryPlan,
    nextBackoff,
} from './arena-sim.mjs';

test('parseConfigH reads the defines the web app puts in config.h', () => {
    const text = [
        '// comment',
        '#define ARENA_SERVER_URL   "wss://ediasv.dev/crossliseu/api/arena"',
        '#define ARENA_DEVICE_ID    "arena-da-garagem-7f3a"',
        '#define ARENA_DEVICE_TOKEN "abc123"',
        '#define WIFI_SSID          "sua rede"',
    ].join('\n');
    assert.deepEqual(parseConfigH(text), {
        url: 'wss://ediasv.dev/crossliseu/api/arena',
        deviceId: 'arena-da-garagem-7f3a',
        token: 'abc123',
    });
});

test('resolveOptions: flags beat env, env beats config.h', () => {
    const opts = resolveOptions(
        ['--device-id', 'from-flag'],
        { ARENA_DEVICE_ID: 'from-env', ARENA_TOKEN: 'env-token' },
        { url: 'ws://config/arena', deviceId: 'from-config', token: 'config-token' },
    );
    assert.equal(opts.deviceId, 'from-flag');
    assert.equal(opts.token, 'env-token');
    assert.equal(opts.url, 'ws://config/arena');
    assert.equal(opts.protocol, 1);
    assert.equal(opts.reconnect, true);
});

test('resolveOptions accepts --flag=value, --protocol and --no-reconnect', () => {
    const opts = resolveOptions(
        ['--url=ws://localhost:3000/arena', '--token=t', '--device-id=d', '--protocol', '2', '--no-reconnect'],
        {},
        {},
    );
    assert.equal(opts.url, 'ws://localhost:3000/arena');
    assert.equal(opts.protocol, 2);
    assert.equal(opts.reconnect, false);
});

test('resolveOptions reports what is missing', () => {
    assert.throws(() => resolveOptions([], {}, {}), /url, device id, token/);
});

test('resolveOptions rejects unknown flags', () => {
    assert.throws(() => resolveOptions(['--nope'], {}, {}), /Unknown option: --nope/);
});

test('formatTime rounds up to the next whole second, like the box', () => {
    assert.equal(formatTime(94210), '01:35');
    assert.equal(formatTime(180000), '03:00');
    assert.equal(formatTime(1), '00:01');
    assert.equal(formatTime(0), '00:00');
    assert.equal(formatTime(-5), '00:00');
    assert.equal(formatTime(null), '--:--');
});

test('describeState summarises a state snapshot', () => {
    assert.equal(
        describeState({ status: 'idle', matchId: null, remainingMs: null, endReason: null, robots: null }),
        'IDLE',
    );
    assert.equal(
        describeState({
            status: 'ended',
            matchId: '6f1c',
            remainingMs: 61530,
            endReason: 'surrender_B',
            robots: { A: { name: 'Tritura' }, B: { name: 'Ferrugem' } },
        }),
        'ENDED 01:02 (surrender_B)  A=Tritura  B=Ferrugem  match=6f1c',
    );
});

test('retryPlan follows the close-code table', () => {
    assert.deepEqual(retryPlan(4001), { retry: true, delayMs: 60_000, reason: 'bad credentials or malformed hello' });
    assert.deepEqual(retryPlan(4004), { retry: true, delayMs: 60_000, reason: 'protocol version not supported' });
    assert.equal(retryPlan(4003).retry, false);
    assert.deepEqual(retryPlan(4002), { retry: true, delayMs: null, reason: 'no hello within 5 s' });
    assert.deepEqual(retryPlan(1006), { retry: true, delayMs: null, reason: 'connection lost' });
});

test('nextBackoff doubles from 1 s up to 30 s', () => {
    assert.equal(nextBackoff(1000), 2000);
    assert.equal(nextBackoff(16000), 30000);
    assert.equal(nextBackoff(30000), 30000);
});
