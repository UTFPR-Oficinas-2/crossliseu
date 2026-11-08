import { Injectable } from '@nestjs/common';

/** What the registry and the session need from a ws socket; `ws`'s WebSocket satisfies it */
export interface DeviceSocket {
    send(text: string): void;
    close(code: number, reason: string): void;
    ping(): void;
    terminate(): void;
}

/**
 * The authenticated socket of each arena box, in memory: an arena is online while it has one.
 * At most one socket per arena; a newer login takes the place of the older one.
 */
@Injectable()
export class ArenaConnections {
    private readonly sockets = new Map<string, DeviceSocket>();

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

    isOnline(arenaId: string): boolean {
        return this.sockets.has(arenaId);
    }
}
