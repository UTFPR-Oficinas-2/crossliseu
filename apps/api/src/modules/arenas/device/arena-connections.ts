import { Injectable } from '@nestjs/common';

/** ws's readyState for an open socket (CLOSING is 2, CLOSED is 3) */
export const SOCKET_OPEN = 1;

/** What the registry and the session need from a ws socket; `ws`'s WebSocket satisfies it */
export interface DeviceSocket {
    readonly readyState: number;
    send(text: string): void;
    close(code: number, reason: string): void;
    ping(): void;
    terminate(): void;
}

/**
 * The authenticated socket of each arena box, in memory: an arena is online while it has one.
 * At most one socket per arena; a newer login takes the place of the older one.
 *
 * Assumes one API process (compose.prod.yml runs one api container). A restart resets it, which
 * is right: every box socket drops with the process and logs in again. Running several replicas
 * would need this state shared (and boxes routed to a single instance).
 */
@Injectable()
export class ArenaConnections {
    private readonly sockets = new Map<string, DeviceSocket>();
    // Revocations, so a login whose credential check overlapped one can be refused
    private revisionCounter = 0;
    private readonly revokedAt = new Map<string, number>();

    /** A marker to read before checking credentials, for revokedSince() */
    revision(): number {
        return this.revisionCounter;
    }

    /** Whether the arena's credentials were revoked (drop()) after `revision` was read */
    revokedSince(arenaId: string, revision: number): boolean {
        return (this.revokedAt.get(arenaId) ?? 0) > revision;
    }

    /** Makes `socket` the arena's live connection; returns the one it replaces, if any */
    claim(arenaId: string, socket: DeviceSocket): DeviceSocket | undefined {
        const previous = this.sockets.get(arenaId);
        this.sockets.set(arenaId, socket);
        return previous;
    }

    /** Forgets the arena's connection only if it is still `socket`, so a replaced socket can't take the arena offline */
    release(arenaId: string, socket: DeviceSocket): void {
        if (this.sockets.get(arenaId) === socket) {
            this.sockets.delete(arenaId);
        }
    }

    /**
     * Its credentials were revoked: closes the arena's live socket, if any, and forgets it. Logins
     * still being checked for the arena are refused through revokedSince().
     */
    drop(arenaId: string, code: number, reason: string): void {
        this.revokedAt.set(arenaId, ++this.revisionCounter);
        const socket = this.sockets.get(arenaId);
        if (socket) {
            this.sockets.delete(arenaId);
            socket.close(code, reason);
        }
    }

    isOnline(arenaId: string): boolean {
        return this.sockets.has(arenaId);
    }
}
