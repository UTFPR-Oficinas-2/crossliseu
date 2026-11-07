// Shown once, when the arena is created (or its token rotated); the token is never stored in plain text
export class DeviceCredentials {
    deviceId: string;
    token: string;
    /** WebSocket address the arena box connects to; null when ARENA_SERVER_URL is not configured */
    serverUrl: string | null;
}
