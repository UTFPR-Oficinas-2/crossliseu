import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import type { Mock } from 'vitest';
import { FightEvents } from '../matches/fight/fight-events.js';
import type { FightState } from '../matches/fight/fight-state.js';
import type {
    FightService,
    OperatorFightState,
} from '../matches/fight/fight.service.js';
import { FightConnections } from './fight-connections.js';
import { FightStatePusher } from './fight-state-pusher.js';
import type { FightSocket } from './fight-session.js';

const MATCH_ID = 'match-1';

class FakeSocket implements FightSocket {
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

function operatorState(remainingMs: number): OperatorFightState {
    return {
        ...fightState(remainingMs),
        closed: false,
        hasSelectedArena: true,
        winnerSide: null,
    } as OperatorFightState;
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

describe('FightStatePusher', () => {
    let connections: FightConnections;
    let events: FightEvents;
    let state: Mock<(matchId: string) => Promise<FightState>>;
    let opState: Mock<(matchId: string) => Promise<OperatorFightState>>;
    let pusher: FightStatePusher;
    let warn: Mock<(...args: unknown[]) => void>;
    let referee: FakeSocket;
    let operator: FakeSocket;

    beforeEach(() => {
        connections = new FightConnections();
        events = new FightEvents();
        referee = new FakeSocket();
        operator = new FakeSocket();
        state = vi.fn(() => Promise.resolve(fightState(1000)));
        opState = vi.fn(() => Promise.resolve(operatorState(1000)));
        pusher = new FightStatePusher(
            connections,
            { state, operatorState: opState } as unknown as FightService,
            events,
        );
        warn = vi.fn();
        pusher.logger.warn = warn;
        pusher.logger.debug = vi.fn();
    });

    it('sends the public frame to a referee and the operator frame to an operator', async () => {
        connections.add(MATCH_ID, 'referee', referee);
        connections.add(MATCH_ID, 'operator', operator);
        pusher.onModuleInit();

        events.emit({ matchId: MATCH_ID, arenaId: null });
        await vi.waitFor(() => expect(operator.sent).toHaveLength(1));

        expect(referee.sent).toEqual([
            { event: 'state', data: fightState(1000) },
        ]);
        expect(operator.sent).toEqual([
            { event: 'state', data: operatorState(1000) },
        ]);
    });

    it('reads the operator state only when an operator is subscribed', async () => {
        connections.add(MATCH_ID, 'referee', referee);

        await pusher.push(MATCH_ID);

        expect(state).toHaveBeenCalledTimes(1);
        expect(opState).not.toHaveBeenCalled();
    });

    it('reads nothing for a match without subscribers', async () => {
        await pusher.push(MATCH_ID);

        expect(state).not.toHaveBeenCalled();
        expect(opState).not.toHaveBeenCalled();
    });

    it('two quick pushes send in order and the last frame is the newest state', async () => {
        connections.add(MATCH_ID, 'referee', referee);
        const first = deferred<FightState>();
        let current = 1000;
        state
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(() => Promise.resolve(fightState(current)));

        const a = pusher.push(MATCH_ID);
        const b = pusher.push(MATCH_ID);
        await vi.waitFor(() => expect(state).toHaveBeenCalledTimes(1));
        await new Promise((resolve) => setImmediate(resolve));
        expect(state).toHaveBeenCalledTimes(1);
        current = 500;
        first.resolve(fightState(1000));
        await Promise.all([a, b]);

        expect(referee.sent).toEqual([
            { event: 'state', data: fightState(1000) },
            { event: 'state', data: fightState(500) },
        ]);
        const chains = (pusher as unknown as { chains: Map<string, unknown> })
            .chains;
        expect(chains.size).toBe(0);
    });

    it('skips and forgets a socket whose send throws, others still get the frame', async () => {
        const bad = new FakeSocket();
        bad.send.mockImplementation(() => {
            throw new Error('socket gone');
        });
        connections.add(MATCH_ID, 'referee', bad);
        connections.add(MATCH_ID, 'referee', referee);

        await expect(pusher.push(MATCH_ID)).resolves.toBeUndefined();

        expect(referee.sent).toHaveLength(1);
        expect(connections.subscribers(MATCH_ID)).toEqual([
            { role: 'referee', socket: referee },
        ]);
    });

    it('skips and forgets a socket that is not open', async () => {
        const closing = new FakeSocket();
        closing.readyState = 2;
        connections.add(MATCH_ID, 'referee', closing);
        connections.add(MATCH_ID, 'referee', referee);

        await pusher.push(MATCH_ID);

        expect(closing.send).not.toHaveBeenCalled();
        expect(referee.sent).toHaveLength(1);
        expect(connections.subscribers(MATCH_ID)).toHaveLength(1);
    });

    it('closes the match subscribers with 4005 when the match is gone', async () => {
        connections.add(MATCH_ID, 'referee', referee);
        connections.add(MATCH_ID, 'operator', operator);
        state.mockRejectedValueOnce(new NotFoundException('match_not_found'));

        await pusher.push(MATCH_ID);

        expect(referee.close).toHaveBeenCalledWith(4005, 'match_not_found');
        expect(operator.close).toHaveBeenCalledWith(4005, 'match_not_found');
        expect(connections.hasSubscribers(MATCH_ID)).toBe(false);
    });

    it('closes an operator-only match with 4005 when the operator read finds no match', async () => {
        connections.add(MATCH_ID, 'operator', operator);
        opState.mockRejectedValueOnce(new NotFoundException('match_not_found'));

        await pusher.push(MATCH_ID);

        expect(operator.close).toHaveBeenCalledWith(4005, 'match_not_found');
    });

    it('only logs any other error', async () => {
        connections.add(MATCH_ID, 'referee', referee);
        state.mockRejectedValueOnce(new Error('db down'));

        await expect(pusher.push(MATCH_ID)).resolves.toBeUndefined();

        expect(warn).toHaveBeenCalledWith('fight_state_push_failed', {
            matchId: MATCH_ID,
            message: 'db down',
        });
        expect(referee.close).not.toHaveBeenCalled();
        expect(connections.hasSubscribers(MATCH_ID)).toBe(true);
        await pusher.push(MATCH_ID);
        expect(referee.sent).toHaveLength(1);
    });

    it('sendSnapshot sends the role frame to one socket and returns true', async () => {
        connections.add(MATCH_ID, 'operator', operator);
        connections.add(MATCH_ID, 'referee', referee);

        await expect(
            pusher.sendSnapshot(MATCH_ID, 'operator', operator),
        ).resolves.toBe(true);

        expect(operator.sent).toEqual([
            { event: 'state', data: operatorState(1000) },
        ]);
        expect(referee.sent).toEqual([]);
    });

    it('sendSnapshot returns false when the match does not exist', async () => {
        state.mockRejectedValueOnce(new NotFoundException('match_not_found'));

        await expect(
            pusher.sendSnapshot(MATCH_ID, 'referee', referee),
        ).resolves.toBe(false);

        expect(referee.sent).toEqual([]);
    });

    it('a change during a held-open snapshot read produces a later frame that reflects it', async () => {
        connections.add(MATCH_ID, 'referee', referee);
        const held = deferred<FightState>();
        let current = 1000;
        state
            .mockImplementationOnce(() => held.promise)
            .mockImplementationOnce(() => Promise.resolve(fightState(current)));

        const snapshot = pusher.sendSnapshot(MATCH_ID, 'referee', referee);
        await vi.waitFor(() => expect(state).toHaveBeenCalledTimes(1));
        const push = pusher.push(MATCH_ID);
        current = 300;
        held.resolve(fightState(1000));
        await Promise.all([snapshot, push]);

        expect(referee.sent).toEqual([
            { event: 'state', data: fightState(1000) },
            { event: 'state', data: fightState(300) },
        ]);
    });

    it('stops listening on module destroy', async () => {
        connections.add(MATCH_ID, 'referee', referee);
        pusher.onModuleInit();
        pusher.onModuleDestroy();

        events.emit({ matchId: MATCH_ID, arenaId: null });
        await Promise.resolve();

        expect(state).not.toHaveBeenCalled();
    });
});
