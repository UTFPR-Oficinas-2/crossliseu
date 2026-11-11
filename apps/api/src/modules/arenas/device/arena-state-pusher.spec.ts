import 'reflect-metadata';
import type { Mock } from 'vitest';
import { ArenaConnections, type DeviceSocket } from './arena-connections.js';
import { ArenaStatePusher } from './arena-state-pusher.js';
import type { ArenasRepository } from '../arenas.repository.js';
import { FightEvents } from '../../matches/fight/fight-events.js';
import type { FightService } from '../../matches/fight/fight.service.js';
import type { FightState } from '../../matches/fight/fight-state.js';

const ARENA_ID = 'arena-1';
const MATCH_ID = 'match-1';

class FakeSocket implements DeviceSocket {
    readyState = 1;
    sent: unknown[] = [];
    send = vi.fn((text: string) => {
        this.sent.push(JSON.parse(text));
    });
    close = vi.fn();
    ping = vi.fn();
    terminate = vi.fn();
}

function fightState(remainingMs: number): FightState {
    return {
        status: 'ongoing',
        matchId: MATCH_ID,
        remainingMs,
        endReason: null,
        robots: { A: { name: 'Tritura' }, B: { name: 'Ferrugem' } },
    };
}

const IDLE = {
    event: 'state',
    data: {
        status: 'idle',
        matchId: null,
        remainingMs: null,
        endReason: null,
        robots: null,
    },
};

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

describe('ArenaStatePusher', () => {
    let connections: ArenaConnections;
    let events: FightEvents;
    let socket: FakeSocket;
    let findCurrentMatchId: Mock<(arenaId: string) => Promise<string | null>>;
    let state: Mock<(matchId: string) => Promise<FightState>>;
    let pusher: ArenaStatePusher;
    let warn: Mock<(...args: unknown[]) => void>;

    beforeEach(() => {
        connections = new ArenaConnections();
        events = new FightEvents();
        socket = new FakeSocket();
        connections.claim(ARENA_ID, socket);
        findCurrentMatchId = vi.fn(() => Promise.resolve(MATCH_ID));
        state = vi.fn(() => Promise.resolve(fightState(1000)));
        pusher = new ArenaStatePusher(
            connections,
            { findCurrentMatchId } as unknown as ArenasRepository,
            { state } as unknown as FightService,
            events,
        );
        warn = vi.fn();
        pusher.logger.warn = warn;
    });

    it('logs at debug when the box went away before the frame was sent', async () => {
        const debug = vi.fn();
        pusher.logger.debug = debug;
        vi.spyOn(connections, 'send').mockReturnValue(false);

        await pusher.push(ARENA_ID);

        expect(debug).toHaveBeenCalledWith('arena_state_push_dropped', {
            arenaId: ARENA_ID,
        });
        expect(warn).not.toHaveBeenCalled();
    });

    it('sends idle when the arena has no current match', async () => {
        findCurrentMatchId.mockResolvedValueOnce(null);

        await pusher.push(ARENA_ID);

        expect(socket.sent).toEqual([IDLE]);
        expect(state).not.toHaveBeenCalled();
    });

    it('sends the fight state of the current match', async () => {
        await pusher.push(ARENA_ID);

        expect(findCurrentMatchId).toHaveBeenCalledWith(ARENA_ID);
        expect(state).toHaveBeenCalledWith(MATCH_ID);
        expect(socket.sent).toEqual([
            { event: 'state', data: fightState(1000) },
        ]);
    });

    it('does nothing for an offline arena', async () => {
        await pusher.push('arena-offline');

        expect(findCurrentMatchId).not.toHaveBeenCalled();
        expect(state).not.toHaveBeenCalled();
        expect(socket.sent).toEqual([]);
    });

    it('two quick pushes send in order and the last frame is the newest state', async () => {
        const first = deferred<FightState>();
        let current = 1000;
        state
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(() => Promise.resolve(fightState(current)));

        const a = pusher.push(ARENA_ID);
        const b = pusher.push(ARENA_ID);
        await vi.waitFor(() => expect(state).toHaveBeenCalledTimes(1));
        // The second push hasn't read anything yet: it waits for the first
        await new Promise((resolve) => setImmediate(resolve));
        expect(findCurrentMatchId).toHaveBeenCalledTimes(1);
        expect(state).toHaveBeenCalledTimes(1);
        current = 500;
        first.resolve(fightState(1000));
        await Promise.all([a, b]);

        expect(socket.sent).toEqual([
            { event: 'state', data: fightState(1000) },
            { event: 'state', data: fightState(500) },
        ]);
        // The settled chain is forgotten, so the map stays bounded
        const chains = (pusher as unknown as { chains: Map<string, unknown> })
            .chains;
        expect(chains.size).toBe(0);
    });

    it('a failing state build is logged and resolves', async () => {
        state.mockRejectedValueOnce(new Error('db down'));

        await expect(pusher.push(ARENA_ID)).resolves.toBeUndefined();

        expect(socket.sent).toEqual([]);
        expect(warn).toHaveBeenCalledWith('arena_state_push_failed', {
            arenaId: ARENA_ID,
            message: 'db down',
        });
        // The chain goes on after a failure
        await pusher.push(ARENA_ID);
        expect(socket.sent).toHaveLength(1);
    });

    it('a throwing socket send is logged and resolves', async () => {
        socket.send.mockImplementationOnce(() => {
            throw new Error('socket gone');
        });

        await expect(pusher.push(ARENA_ID)).resolves.toBeUndefined();

        expect(warn).toHaveBeenCalledWith('arena_state_push_failed', {
            arenaId: ARENA_ID,
            message: 'socket gone',
        });
    });

    it('pushes on a FightEvents change with an arena id and ignores null', async () => {
        pusher.onModuleInit();

        events.emit({ matchId: MATCH_ID, arenaId: null });
        events.emit({ matchId: MATCH_ID, arenaId: ARENA_ID });
        await vi.waitFor(() => expect(socket.sent).toHaveLength(1));

        expect(findCurrentMatchId).toHaveBeenCalledTimes(1);
        expect(findCurrentMatchId).toHaveBeenCalledWith(ARENA_ID);
    });

    it('stops listening on module destroy', async () => {
        pusher.onModuleInit();
        pusher.onModuleDestroy();

        events.emit({ matchId: MATCH_ID, arenaId: ARENA_ID });
        await Promise.resolve();

        expect(findCurrentMatchId).not.toHaveBeenCalled();
    });
});
