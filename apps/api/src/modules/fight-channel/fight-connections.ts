import { Injectable } from '@nestjs/common';
import type { FightAccess } from './fight-access.js';
import type { FightSocket } from './fight-session.js';

type Subscriber = { role: FightAccess['role']; socket: FightSocket };

/**
 * The sockets subscribed to each match on /fights, in memory. Assumes one API process, like
 * ArenaConnections: a restart drops every socket and the clients resubscribe.
 */
@Injectable()
export class FightConnections {
    private readonly byMatch = new Map<string, Map<FightSocket, Subscriber>>();
    private readonly matchOf = new Map<FightSocket, string>();

    /** A socket follows one match: adding it again moves it */
    add(
        matchId: string,
        role: FightAccess['role'],
        socket: FightSocket,
    ): void {
        this.remove(socket);
        let sockets = this.byMatch.get(matchId);
        if (!sockets) {
            sockets = new Map();
            this.byMatch.set(matchId, sockets);
        }
        sockets.set(socket, { role, socket });
        this.matchOf.set(socket, matchId);
    }

    /** Forgets the socket; a no-op for one that was never added */
    remove(socket: FightSocket): void {
        const matchId = this.matchOf.get(socket);
        if (matchId === undefined) {
            return;
        }
        this.matchOf.delete(socket);
        const sockets = this.byMatch.get(matchId);
        sockets?.delete(socket);
        if (sockets?.size === 0) {
            this.byMatch.delete(matchId);
        }
    }

    hasSubscribers(matchId: string): boolean {
        return this.byMatch.has(matchId);
    }

    subscribers(matchId: string): Subscriber[] {
        return [...(this.byMatch.get(matchId)?.values() ?? [])];
    }

    /** Closes and forgets every socket of the match; one that throws on close doesn't stop the rest */
    closeMatch(matchId: string, code: number, reason: string): void {
        for (const { socket } of this.subscribers(matchId)) {
            this.remove(socket);
            try {
                socket.close(code, reason);
            } catch {
                // Already gone
            }
        }
    }
}
