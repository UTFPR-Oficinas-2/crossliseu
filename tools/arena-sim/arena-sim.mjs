#!/usr/bin/env node
// ESP32 arena box simulator for the /arena WebSocket protocol (docs/arena-protocol.md).
//
// Logs in as an arena box, prints every message the server sends, and sends
// `surrender` when you press a key, so the arena flow can be tested without the
// real hardware. No dependencies: it uses Node's built-in WebSocket (Node >= 22).
//
// Usage
//   node tools/arena-sim/arena-sim.mjs --url <ws-url> --device-id <id> --token <token>
//   node tools/arena-sim/arena-sim.mjs --config apps/firmware/config.h
//
// Options (flags beat env vars, env vars beat --config)
//   --url <ws-url>        ARENA_URL         e.g. ws://localhost:3000/arena
//                                           or   wss://ediasv.dev/crossliseu/api/arena
//   --device-id <id>      ARENA_DEVICE_ID   from the Arenas page of the web app
//   --token <token>       ARENA_TOKEN       shown once on the Arenas page
//   --config <config.h>   ARENA_CONFIG      read the three values above from the config.h
//                                           downloaded from the Arenas page
//   --protocol <n>        protocol version sent in hello (default 1; try 2 to see 4004)
//   --no-reconnect        exit on the first close instead of retrying like the box
//   --help
//
// Keys (or type them and press Enter when stdin is not a terminal)
//   a / b   send `surrender` for side A / B with the matchId of the last `state`
//   h       send `hello` again (the server should answer `already_authenticated`)
//   s       print the last `state` again
//   q       quit (Ctrl+C also works)
//
// Like the box, presses while not connected (before `welcome`) are dropped, and
// reconnects follow the protocol's backoff: 1 s doubling to 30 s, 60 s after 4001
// or 4004, and no retry after 4003 (replaced by a newer connection).
//
// Examples
//   ARENA_URL=ws://localhost:3000/arena ARENA_DEVICE_ID=arena-01-ab12 ARENA_TOKEN=... \
//     node tools/arena-sim/arena-sim.mjs
//   node tools/arena-sim/arena-sim.mjs --config apps/firmware/config.h --url ws://localhost:3000/arena
//
// Tests: node --test 'tools/**/*.test.mjs'

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PROTOCOL_VERSION = 1;
const BACKOFF_START_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
const SLOW_RETRY_MS = 60_000;

const CONFIG_DEFINES = {
    ARENA_SERVER_URL: 'url',
    ARENA_DEVICE_ID: 'deviceId',
    ARENA_DEVICE_TOKEN: 'token',
};

/** Reads ARENA_SERVER_URL / ARENA_DEVICE_ID / ARENA_DEVICE_TOKEN from a firmware config.h */
export function parseConfigH(text) {
    const config = {};
    for (const match of text.matchAll(/^\s*#define\s+(\w+)\s+"([^"]*)"/gm)) {
        const key = CONFIG_DEFINES[match[1]];
        if (key) config[key] = match[2];
    }
    return config;
}

const VALUE_FLAGS = { '--url': 'url', '--device-id': 'deviceId', '--token': 'token', '--config': 'config', '--protocol': 'protocol' };

function parseArgs(argv) {
    const flags = {};
    for (let i = 0; i < argv.length; i++) {
        const [name, inline] = argv[i].split(/=(.*)/s);
        if (name === '--help' || name === '-h') flags.help = true;
        else if (name === '--no-reconnect') flags.reconnect = false;
        else if (VALUE_FLAGS[name]) {
            const value = inline ?? argv[++i];
            if (value === undefined) throw new Error(`Missing value for ${name}`);
            flags[VALUE_FLAGS[name]] = value;
        } else throw new Error(`Unknown option: ${argv[i]}`);
    }
    return flags;
}

/** Combines flags, env and config.h values; flags win over env, env over config.h */
export function resolveOptions(argv, env, config = {}) {
    const flags = parseArgs(argv);
    if (flags.help) return { help: true };
    const opts = {
        url: flags.url ?? env.ARENA_URL ?? config.url,
        deviceId: flags.deviceId ?? env.ARENA_DEVICE_ID ?? config.deviceId,
        token: flags.token ?? env.ARENA_TOKEN ?? config.token,
        protocol: Number(flags.protocol ?? PROTOCOL_VERSION),
        reconnect: flags.reconnect ?? true,
    };
    const missing = [
        !opts.url && 'url',
        !opts.deviceId && 'device id',
        !opts.token && 'token',
    ].filter(Boolean);
    if (missing.length) throw new Error(`Missing ${missing.join(', ')} (see --help)`);
    if (!Number.isInteger(opts.protocol)) throw new Error('--protocol must be an integer');
    return opts;
}

/** The flag or env path to a config.h, read before resolving the other options */
function configPath(argv, env) {
    try {
        return parseArgs(argv).config ?? env.ARENA_CONFIG;
    } catch {
        return env.ARENA_CONFIG; // resolveOptions reports the bad flag
    }
}

/** mm:ss rounded up to the next whole second, as the box shows it */
export function formatTime(ms) {
    if (ms === null || ms === undefined) return '--:--';
    const total = Math.max(0, Math.ceil(ms / 1000));
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${mm}:${ss}`;
}

/** One-line summary of a `state` snapshot */
export function describeState(state) {
    if (state.status === 'idle') return 'IDLE';
    let line = `${String(state.status).toUpperCase()} ${formatTime(state.remainingMs)}`;
    if (state.endReason) line += ` (${state.endReason})`;
    if (state.robots) line += `  A=${state.robots.A?.name}  B=${state.robots.B?.name}`;
    return `${line}  match=${state.matchId}`;
}

/** How the box reacts to a close code; delayMs null means normal backoff */
export function retryPlan(code) {
    switch (code) {
        case 4001: return { retry: true, delayMs: SLOW_RETRY_MS, reason: 'bad credentials or malformed hello' };
        case 4002: return { retry: true, delayMs: null, reason: 'no hello within 5 s' };
        case 4003: return { retry: false, delayMs: null, reason: 'replaced by a newer connection with the same deviceId' };
        case 4004: return { retry: true, delayMs: SLOW_RETRY_MS, reason: 'protocol version not supported' };
        default: return { retry: true, delayMs: null, reason: 'connection lost' };
    }
}

export function nextBackoff(ms) {
    return Math.min(ms * 2, BACKOFF_MAX_MS);
}

function log(...parts) {
    const time = new Date().toTimeString().slice(0, 8);
    console.log(`[${time}]`, ...parts);
}

function run(opts) {
    let socket = null;
    let connected = false; // got `welcome` on the current socket
    let lastState = null;
    let backoff = BACKOFF_START_MS;
    let retryTimer = null;
    let quitting = false;

    const send = (event, data) => {
        const frame = JSON.stringify({ event, data });
        socket.send(frame);
        log('→', frame);
    };

    const sendHello = () => send('hello', { deviceId: opts.deviceId, token: opts.token, protocol: opts.protocol });

    function connect() {
        retryTimer = null;
        log(`connecting to ${opts.url} as ${opts.deviceId}`);
        socket = new WebSocket(opts.url);
        socket.addEventListener('open', sendHello);
        socket.addEventListener('message', onMessage);
        // A close event always follows and is logged there; only add detail when there is some
        socket.addEventListener('error', (event) => {
            const detail = event.message || event.error?.message;
            if (detail) log('socket error:', detail);
        });
        socket.addEventListener('close', onClose);
    }

    function onMessage({ data }) {
        let msg;
        try {
            msg = JSON.parse(String(data));
        } catch {
            log('← (not JSON)', String(data));
            return;
        }
        switch (msg.event) {
            case 'welcome':
                connected = true;
                backoff = BACKOFF_START_MS;
                log(`← welcome: connected as "${msg.data?.arenaName}"`);
                break;
            case 'state':
                lastState = msg.data;
                log('← state:', describeState(msg.data));
                break;
            case 'error':
                log(`← error: ${msg.data?.code}: ${msg.data?.message}`);
                break;
            default:
                log('← (unexpected)', JSON.stringify(msg));
        }
    }

    function onClose({ code, reason }) {
        connected = false;
        socket = null;
        if (quitting) return;
        const plan = retryPlan(code);
        log(`closed ${code}${reason ? ` "${reason}"` : ''}: ${plan.reason}`);
        if (!plan.retry || !opts.reconnect) {
            log(plan.retry ? 'not reconnecting (--no-reconnect)' : 'not reconnecting, like the box until it reboots');
            process.exit(code === 1000 ? 0 : 1);
        }
        const delay = plan.delayMs ?? backoff;
        if (plan.delayMs === null) backoff = nextBackoff(backoff);
        log(`reconnecting in ${delay / 1000} s`);
        retryTimer = setTimeout(connect, delay);
    }

    function surrender(side) {
        if (!connected) {
            log(`surrender ${side} dropped: not connected`);
            return;
        }
        send('surrender', { side, matchId: lastState?.matchId ?? null });
    }

    function quit() {
        quitting = true;
        clearTimeout(retryTimer);
        if (socket) socket.close(1000);
        process.exit(0);
    }

    function onKey(key) {
        switch (key.toLowerCase()) {
            case 'a': return surrender('A');
            case 'b': return surrender('B');
            case 'h': return socket?.readyState === WebSocket.OPEN ? sendHello() : log('hello dropped: socket not open');
            case 's': return log('last state:', lastState ? describeState(lastState) : '(none)');
            case 'q':
            case '\u0003': // Ctrl+C in raw mode
                return quit();
        }
    }

    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
        for (const key of chunk) if (key.trim()) onKey(key);
    });
    process.on('SIGINT', quit);

    log('keys: a/b surrender A/B · h hello again · s last state · q quit');
    connect();
}

function main() {
    if (typeof WebSocket === 'undefined') {
        console.error('This script needs Node 22 or newer (built-in WebSocket).');
        process.exit(2);
    }
    let opts;
    try {
        const path = configPath(process.argv.slice(2), process.env);
        const config = path ? parseConfigH(readFileSync(path, 'utf8')) : {};
        opts = resolveOptions(process.argv.slice(2), process.env, config);
    } catch (err) {
        console.error(err.message);
        process.exit(2);
    }
    if (opts.help) {
        const header = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0];
        console.log(header.replace(/^#!.*\n/, '').replace(/^\/\/ ?/gm, ''));
        return;
    }
    run(opts);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
