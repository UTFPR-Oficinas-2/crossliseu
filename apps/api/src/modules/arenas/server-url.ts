/** The address arena boxes connect to (ARENA_SERVER_URL), or null when unset or empty */
export function arenaServerUrl(): string | null {
    return process.env.ARENA_SERVER_URL || null;
}
