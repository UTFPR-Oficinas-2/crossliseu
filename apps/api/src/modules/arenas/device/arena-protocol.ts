// Frames, limits and codes of the /arena WebSocket protocol (docs/arena-protocol.md)

export const PROTOCOL_VERSION = 1;
export const HELLO_TIMEOUT_MS = 5_000;
export const PING_INTERVAL_MS = 10_000;
export const MAX_FRAME_BYTES = 4096;

export const CloseCode = {
    BadCredentials: 4001,
    HelloTimeout: 4002,
    Replaced: 4003,
    UnsupportedProtocol: 4004,
    InternalError: 1011,
    ServerShutdown: 1001,
} as const;

export type ErrorCode =
    | 'bad_frame'
    | 'unknown_event'
    | 'invalid_data'
    | 'not_authenticated'
    | 'already_authenticated';

export type Frame = { event: string; data: unknown };

export type Hello = { deviceId: string; token: string; protocol: number };

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

/** The fields of a `hello`; null when one is missing or has the wrong type. The version is not checked here. */
export function parseHello(data: unknown): Hello | null {
    if (
        !isPlainObject(data) ||
        typeof data.deviceId !== 'string' ||
        typeof data.token !== 'string' ||
        !Number.isInteger(data.protocol)
    ) {
        return null;
    }
    return {
        deviceId: data.deviceId,
        token: data.token,
        protocol: data.protocol as number,
    };
}

export function welcomeFrame(arenaName: string): string {
    return JSON.stringify({ event: 'welcome', data: { arenaName } });
}

export function errorFrame(code: ErrorCode, message: string): string {
    return JSON.stringify({ event: 'error', data: { code, message } });
}
