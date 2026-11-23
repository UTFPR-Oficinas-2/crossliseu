// Frames, limits and codes of the browser /fights WebSocket channel

import { isUUID } from 'class-validator';
import type { FightState } from '../matches/fight/fight-state.js';
import type { OperatorFightState } from '../matches/fight/fight.service.js';

export const FIGHT_AUTH_TIMEOUT_MS = 5_000;
export const PING_INTERVAL_MS = 10_000;
export const MAX_FRAME_BYTES = 4096;
/** Credential checks that may run at once; an auth beyond that closes with 1013 */
export const MAX_CONCURRENT_CHECKS = 8;

export const FightCloseCode = {
    BadCredentials: 4001,
    AuthTimeout: 4002,
    MatchNotFound: 4005,
    ServerShutdown: 1001,
    ServerBusy: 1013,
    InternalError: 1011,
} as const;

export type ErrorCode =
    | 'bad_frame'
    | 'unknown_event'
    | 'invalid_data'
    | 'not_authenticated'
    | 'already_authenticated';

export type Frame = { event: string; data: unknown };

export type Auth = { matchId: string; token: string; name: string | null };

export type AuthResult =
    | { ok: true; auth: Auth }
    | { ok: false; reason: 'bad_credentials' | 'match_not_found' };

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The envelope of a text frame; null when it isn't a JSON object with a non-empty string `event` */
export function parseFrame(text: string): Frame | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }
    if (
        !isPlainObject(parsed) ||
        typeof parsed.event !== 'string' ||
        parsed.event === ''
    ) {
        return null;
    }
    return { event: parsed.event, data: parsed.data };
}

/**
 * The data of an `auth`. A malformed credential is `bad_credentials` (the client logs out); a
 * `matchId` that isn't a UUID is `match_not_found`, so a mistyped URL never logs the operator out.
 */
export function parseAuth(data: unknown): AuthResult {
    if (
        !isPlainObject(data) ||
        typeof data.token !== 'string' ||
        data.token === '' ||
        (data.name !== undefined && typeof data.name !== 'string')
    ) {
        return { ok: false, reason: 'bad_credentials' };
    }
    if (typeof data.matchId !== 'string' || !isUUID(data.matchId)) {
        return { ok: false, reason: 'match_not_found' };
    }
    return {
        ok: true,
        auth: {
            matchId: data.matchId,
            token: data.token,
            name: data.name ?? null,
        },
    };
}

export function stateFrame(state: FightState | OperatorFightState): string {
    return JSON.stringify({ event: 'state', data: state });
}

export function pingFrame(): string {
    return JSON.stringify({ event: 'ping', data: null });
}

export function errorFrame(code: ErrorCode, message: string): string {
    return JSON.stringify({ event: 'error', data: { code, message } });
}
