import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { FightService, TIMER_RETRY_MS } from './fight.service.js';
import type {
    FightRepository,
    FightWrites,
    LockedFight,
} from './fight.repository.js';
import { Clock } from './clock.js';
import { FightEvents } from './fight-events.js';
import type { FightTimer } from './fight-timer.js';
import type { FightChange } from './fight-events.js';
import { remainingMs, timeOutAt } from './fight-clock.js';
import { Match } from '../entities/match.entity.js';
import type { MatchState } from '../entities/match.entity.js';
import { MatchEvent } from '../entities/match-event.entity.js';
import type { MatchEventType } from '../entities/match-event.entity.js';
import { Robot } from '../../robots/entities/robot.entity.js';
import type { ChampionshipsService } from '../../championships/championships.service.js';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const MATCH_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ARENA_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const OTHER_ARENA_ID = '99999999-9999-4999-8999-999999999999';
const OTHER_MATCH_ID = '88888888-8888-4888-8888-888888888888';
const USER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const T0 = new Date('2026-11-10T14:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

class FixedClock extends Clock {
    constructor(public current: Date) {
        super();
    }
    now() {
        return this.current;
    }
}

function event(type: MatchEventType, occurredAt: Date): MatchEvent {
    const entity = new MatchEvent();
    entity.matchId = MATCH_ID;
    entity.type = type;
    entity.occurredAt = occurredAt;
    entity.actorUserId = USER_ID;
    return entity;
}

interface Options {
    state?: MatchState;
    events?: MatchEvent[];
    arenaId?: string | null;
    owner?: boolean;
    now?: Date;
    missing?: boolean;
    /** The clock moves to this instant once the locks are taken */
    lockedNow?: Date;
}

function cloneMatch(source: Match): Match {
    return Object.assign(
        Object.create(Object.getPrototypeOf(source) as object) as Match,
        source,
    );
}

function setup({
    state = 'scheduled',
    events = [],
    arenaId = null,
    owner = true,
    now = T0,
    missing = false,
    lockedNow,
}: Options = {}) {
    const match = new Match(
        'lightweight',
        CHAMPIONSHIP_ID,
        'a',
        'b',
        USER_ID,
        T0,
    );
    match.id = MATCH_ID;
    match.state = state;
    match.endReason = null;
    match.robotA = new Robot(
        'Tritura',
        'lightweight',
        't',
        CHAMPIONSHIP_ID,
        USER_ID,
    );
    match.robotB = new Robot(
        'Ferrugem',
        'lightweight',
        't',
        CHAMPIONSHIP_ID,
        USER_ID,
    );
    const store = {
        match,
        events: [...events],
        arenaPointer: arenaId,
        written: [] as MatchEvent[],
    };

    const clock = new FixedClock(now);
    const repo = {
        findOngoingIds: vi.fn(() =>
            Promise.resolve(
                !missing && store.match.state === 'ongoing' ? [MATCH_ID] : [],
            ),
        ),
        findMatch: vi.fn(() => Promise.resolve(missing ? null : store.match)),
        findWithRobots: vi.fn(() =>
            Promise.resolve(missing ? null : store.match),
        ),
        findEvents: vi.fn(() => Promise.resolve([...store.events])),
        withLockedFight: vi.fn(
            async (
                id: string,
                work: (f: LockedFight, w: FightWrites) => Promise<unknown>,
            ) => {
                if (missing) {
                    return null;
                }
                if (lockedNow) {
                    clock.current = lockedNow;
                }
                // Like manager.transaction: a rejected `work` rolls everything back
                const snapshot = {
                    match: cloneMatch(store.match),
                    events: [...store.events],
                    written: [...store.written],
                    arenaPointer: store.arenaPointer,
                };
                const writes: FightWrites = {
                    appendEvent: (type, occurredAt, actorUserId) => {
                        const written = event(type, occurredAt);
                        written.actorUserId = actorUserId;
                        store.events.push(written);
                        store.written.push(written);
                        return Promise.resolve();
                    },
                    updateMatch: (patch) => {
                        Object.assign(store.match, patch);
                        return Promise.resolve();
                    },
                    clearArenaPointer: () => {
                        store.arenaPointer = null;
                        return Promise.resolve();
                    },
                };
                try {
                    return await work(
                        {
                            // A copy: the real repository never mutates it
                            match: cloneMatch(store.match),
                            events: [...store.events],
                            // The arena points at this match only
                            arenaId:
                                id === MATCH_ID ? store.arenaPointer : null,
                        },
                        writes,
                    );
                } catch (error) {
                    store.match = snapshot.match;
                    store.events = snapshot.events;
                    store.written = snapshot.written;
                    store.arenaPointer = snapshot.arenaPointer;
                    throw error;
                }
            },
        ),
    };
    const championships = {
        isOwnedBy: vi.fn(() => Promise.resolve(owner)),
    };
    const fightEvents = new FightEvents();
    const changes: FightChange[] = [];
    fightEvents.onChange((change) => changes.push(change));
    const armed = new Map<string, { delayMs: number; onFire: () => void }>();
    const timer = {
        arm: vi.fn((id: string, delayMs: number, onFire: () => void) => {
            armed.set(id, { delayMs, onFire });
        }),
        cancel: vi.fn((id: string) => {
            armed.delete(id);
        }),
        cancelAll: vi.fn(() => armed.clear()),
        armed: vi.fn((id: string) => armed.has(id)),
    };
    const service = new FightService(
        repo as unknown as FightRepository,
        championships as unknown as ChampionshipsService,
        clock,
        fightEvents,
        timer as unknown as FightTimer,
    );
    return {
        service,
        timer,
        armed,
        clock,
        repo,
        store,
        championships,
        events: fightEvents,
        changes,
    };
}

describe('FightService', () => {
    it('start writes started at now with the operator, sets ongoing and the picked arena', async () => {
        const { service, store } = setup({ arenaId: ARENA_ID, now: at(1000) });

        const state = await service.command(MATCH_ID, 'start', USER_ID);

        expect(store.match.state).toBe('ongoing');
        expect(store.match.arenaId).toBe(ARENA_ID);
        expect(store.written).toHaveLength(1);
        expect(store.written[0]).toMatchObject({
            type: 'started',
            occurredAt: at(1000),
            actorUserId: USER_ID,
        });
        expect(state.status).toBe('ongoing');
    });

    it('start with no picked arena leaves arenaId null and still succeeds', async () => {
        const { service, store } = setup();

        await service.command(MATCH_ID, 'start', USER_ID);

        expect(store.match.state).toBe('ongoing');
        expect(store.match.arenaId).toBeNull();
    });

    it('pause, resume and finish write their event and state; finish sets end reason manual', async () => {
        const { service, store } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            now: at(1000),
        });

        await service.command(MATCH_ID, 'pause', USER_ID);
        expect(store.match.state).toBe('paused');
        expect(store.written.at(-1)?.type).toBe('paused');

        await service.command(MATCH_ID, 'resume', USER_ID);
        expect(store.match.state).toBe('ongoing');
        expect(store.written.at(-1)?.type).toBe('resumed');

        const state = await service.command(MATCH_ID, 'finish', USER_ID);
        expect(store.match.state).toBe('finished');
        expect(store.match.endReason).toBe('manual');
        expect(store.written.at(-1)?.type).toBe('finished');
        expect(state.endReason).toBe('manual');
    });

    it('close writes closed and clears the arena pointer; a second close is 409', async () => {
        const { service, store } = setup({
            state: 'finished',
            events: [event('started', T0), event('finished', at(1000))],
            arenaId: ARENA_ID,
            now: at(2000),
        });

        await service.command(MATCH_ID, 'close', USER_ID);

        expect(store.written.map((e) => e.type)).toEqual(['closed']);
        expect(store.arenaPointer).toBeNull();
        await expect(
            service.command(MATCH_ID, 'close', USER_ID),
        ).rejects.toThrow(new ConflictException('match_invalid_transition'));
    });

    it('close without an arena writes closed', async () => {
        const { service, store } = setup({
            state: 'finished',
            events: [event('started', T0), event('finished', at(1000))],
            now: at(2000),
        });

        await service.command(MATCH_ID, 'close', USER_ID);

        expect(store.written.map((e) => e.type)).toEqual(['closed']);
    });

    it('every disallowed command is 409 match_invalid_transition', async () => {
        const cases: [MatchState, 'pause' | 'resume' | 'start'][] = [
            ['scheduled', 'pause'],
            ['ongoing', 'resume'],
            ['finished', 'start'],
        ];
        for (const [state, command] of cases) {
            const { service } = setup({
                state,
                events: state === 'scheduled' ? [] : [event('started', T0)],
                now: at(1000),
            });
            await expect(
                service.command(MATCH_ID, command, USER_ID),
            ).rejects.toThrow(
                new ConflictException('match_invalid_transition'),
            );
        }
    });

    it('a non-owner gets 404 match_not_found and nothing is written', async () => {
        const { service, store, repo } = setup({ owner: false });

        await expect(
            service.command(MATCH_ID, 'start', USER_ID),
        ).rejects.toThrow(new NotFoundException('match_not_found'));
        expect(store.written).toHaveLength(0);
        expect(repo.withLockedFight).not.toHaveBeenCalled();
    });

    it('an unknown match gets 404 match_not_found', async () => {
        const { service } = setup({ missing: true });

        await expect(
            service.command(MATCH_ID, 'start', USER_ID),
        ).rejects.toThrow(new NotFoundException('match_not_found'));
    });

    it('settles an expired ongoing fight: finished, time_out, finished event at the instant time ran out', async () => {
        const { service, store } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            now: at(300_000),
        });

        const state = await service.state(MATCH_ID);

        expect(store.match.state).toBe('finished');
        expect(store.match.endReason).toBe('time_out');
        expect(store.written).toHaveLength(1);
        expect(store.written[0]).toMatchObject({
            type: 'finished',
            occurredAt: at(180_000),
            actorUserId: null,
        });
        expect(state).toMatchObject({
            status: 'finished',
            remainingMs: 0,
            endReason: 'time_out',
        });
    });

    it('settles when time left is exactly 0', async () => {
        const { service, store } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            now: at(180_000),
        });

        expect(await service.settle(MATCH_ID)).toBe(true);
        expect(store.match.state).toBe('finished');
        expect(store.written[0].occurredAt).toEqual(at(180_000));
    });

    it('commits the time-out even when the command is refused', async () => {
        const { service, store } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            now: at(300_000),
        });

        await expect(
            service.command(MATCH_ID, 'pause', USER_ID),
        ).rejects.toThrow(new ConflictException('match_invalid_transition'));

        expect(store.match.state).toBe('finished');
        expect(store.events.map((e) => e.type)).toEqual([
            'started',
            'finished',
        ]);
    });

    it('reads the clock after the locks are taken', async () => {
        const { service, store } = setup({
            now: at(1000),
            lockedNow: at(5000),
        });

        await service.command(MATCH_ID, 'start', USER_ID);

        expect(store.written[0].occurredAt).toEqual(at(5000));
    });

    it('settle() reads the clock after the locks are taken', async () => {
        const { service, store } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            now: at(181_000),
            lockedNow: at(200_000),
        });

        expect(await service.settle(MATCH_ID)).toBe(true);
        expect(store.match.state).toBe('finished');
        expect(store.written[0].occurredAt).toEqual(at(180_000));
    });

    it('settle() takes no lock for a fight with time left', async () => {
        const { service, repo } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            now: at(1000),
        });

        expect(await service.settle(MATCH_ID)).toBe(false);
        expect(repo.withLockedFight).not.toHaveBeenCalled();
    });

    it('settle() returns true without locking when the first look already finds the fight finished', async () => {
        const { service, repo, store } = setup({
            state: 'finished',
            events: [event('started', T0), event('finished', at(180_000))],
            now: at(300_000),
        });
        store.match.endReason = 'time_out';

        expect(await service.settle(MATCH_ID)).toBe(true);
        expect(repo.withLockedFight).not.toHaveBeenCalled();
        expect(store.written).toHaveLength(0);
    });

    it('settle() returns false without locking for an unknown match', async () => {
        const { service, repo } = setup({ missing: true });

        expect(await service.settle(MATCH_ID)).toBe(false);
        expect(repo.withLockedFight).not.toHaveBeenCalled();
    });

    it('settle() returns true when a concurrent call settled the fight first', async () => {
        const { service, repo, store } = setup({
            state: 'finished',
            events: [event('started', T0), event('finished', at(180_000))],
            now: at(300_000),
        });
        store.match.endReason = 'time_out';
        // The lock-free first look still saw it ongoing
        const stale = cloneMatch(store.match);
        stale.state = 'ongoing';
        stale.endReason = null;
        repo.findMatch.mockResolvedValueOnce(stale);
        repo.findEvents.mockResolvedValueOnce([event('started', T0)]);

        expect(await service.settle(MATCH_ID)).toBe(true);
        expect(store.written).toHaveLength(0);
    });

    it('state() returns status, remainingMs, endReason and robot names', async () => {
        const { service } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            now: at(60_000),
        });

        expect(await service.state(MATCH_ID)).toEqual({
            status: 'ongoing',
            matchId: MATCH_ID,
            remainingMs: 120_000,
            endReason: null,
            robots: { A: { name: 'Tritura' }, B: { name: 'Ferrugem' } },
        });
    });

    it('state() of an unknown match is 404 match_not_found', async () => {
        const { service } = setup({ missing: true });

        await expect(service.state(MATCH_ID)).rejects.toThrow(
            new NotFoundException('match_not_found'),
        );
    });

    it('settle() returns false and writes nothing for a fight with time left', async () => {
        const { service, store } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            now: at(1000),
        });

        expect(await service.settle(MATCH_ID)).toBe(false);
        expect(store.written).toHaveLength(0);
    });
});

describe('FightService event order', () => {
    it('stamps resume strictly after pause when the clock does not advance', async () => {
        const { service, store } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            now: at(10_000),
        });

        await service.command(MATCH_ID, 'pause', USER_ID);
        await service.command(MATCH_ID, 'resume', USER_ID);

        const [paused, resumed] = store.written;
        expect(paused.occurredAt).toEqual(at(10_000));
        expect(resumed.occurredAt.getTime()).toBeGreaterThan(
            paused.occurredAt.getTime(),
        );
        const mid = at(20_000);
        expect(remainingMs('ongoing', store.events, mid)).toBe(
            180_000 - 20_000 + 1,
        );
        const end = timeOutAt('ongoing', store.events);
        expect(end).toEqual(at(180_001));
        expect(remainingMs('ongoing', store.events, end as Date)).toBe(0);
        expect(
            remainingMs('ongoing', store.events, new Date(end!.getTime() - 1)),
        ).toBe(1);
    });

    it('keeps the new event after the last one when the clock steps back', async () => {
        const { service, store } = setup({
            state: 'ongoing',
            events: [
                event('started', T0),
                event('paused', at(10_000)),
                event('resumed', at(12_000)),
            ],
            now: at(7_000),
        });

        await service.command(MATCH_ID, 'pause', USER_ID);

        expect(store.written[0].occurredAt.getTime()).toBeGreaterThan(
            12_000 + T0.getTime(),
        );
    });

    it('a time-out finished is after the previous event', async () => {
        const { service, store } = setup({
            state: 'ongoing',
            events: [
                event('started', T0),
                event('paused', at(0)),
                event('resumed', at(0)),
            ],
            now: at(500_000),
        });

        await service.command(MATCH_ID, 'close', USER_ID);

        const finished = store.written.find((e) => e.type === 'finished');
        const closed = store.written.find((e) => e.type === 'closed');
        expect(finished!.occurredAt.getTime()).toBeGreaterThan(T0.getTime());
        expect(closed!.occurredAt.getTime()).toBeGreaterThan(
            finished!.occurredAt.getTime(),
        );
    });
});

describe('FightService change events', () => {
    it('start emits one change with the arena id after the write', async () => {
        const { service, changes } = setup({ arenaId: ARENA_ID });

        await service.command(MATCH_ID, 'start', USER_ID);

        expect(changes).toEqual([{ matchId: MATCH_ID, arenaId: ARENA_ID }]);
    });

    it('close emits the arena id it cleared', async () => {
        const { service, changes, store } = setup({
            state: 'finished',
            events: [event('started', T0), event('finished', at(1000))],
            arenaId: ARENA_ID,
            now: at(2000),
        });

        await service.command(MATCH_ID, 'close', USER_ID);

        expect(store.arenaPointer).toBeNull();
        expect(changes).toEqual([{ matchId: MATCH_ID, arenaId: ARENA_ID }]);
    });

    it('a refused command that settled a time-out still emits', async () => {
        const { service, changes } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            arenaId: ARENA_ID,
            now: at(180_001),
        });

        await expect(
            service.command(MATCH_ID, 'pause', USER_ID),
        ).rejects.toThrow(ConflictException);
        expect(changes).toEqual([{ matchId: MATCH_ID, arenaId: ARENA_ID }]);
    });

    it('a refused command with nothing written emits nothing', async () => {
        const { service, changes } = setup({ arenaId: ARENA_ID });

        await expect(
            service.command(MATCH_ID, 'pause', USER_ID),
        ).rejects.toThrow(ConflictException);
        expect(changes).toEqual([]);
    });

    it('settle() that writes a time-out emits', async () => {
        const { service, changes } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            arenaId: ARENA_ID,
            now: at(180_000),
        });

        expect(await service.settle(MATCH_ID)).toBe(true);
        expect(changes).toEqual([{ matchId: MATCH_ID, arenaId: ARENA_ID }]);
    });

    it('state() of a fight with time left emits nothing', async () => {
        const { service, changes } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            arenaId: ARENA_ID,
            now: at(60_000),
        });

        await service.state(MATCH_ID);

        expect(changes).toEqual([]);
    });

    it('emits after the transaction resolved, not inside it', async () => {
        const { service, repo, events } = setup({ arenaId: ARENA_ID });
        const impl = repo.withLockedFight.getMockImplementation()!;
        let inside = false;
        repo.withLockedFight.mockImplementationOnce(async (id, work) => {
            inside = true;
            try {
                return await impl(id, work);
            } finally {
                inside = false;
            }
        });
        const seenInside: boolean[] = [];
        events.onChange(() => seenInside.push(inside));

        await service.command(MATCH_ID, 'start', USER_ID);

        expect(seenInside).toEqual([false]);
    });
});

describe('FightService.surrender', () => {
    function ongoing(now = at(60_000)) {
        return setup({
            state: 'ongoing',
            events: [event('started', T0)],
            arenaId: ARENA_ID,
            now,
        });
    }

    it('surrender by A on the ongoing current match finishes it with B as winner', async () => {
        const { service, store, changes } = ongoing();

        expect(await service.surrender(ARENA_ID, MATCH_ID, 'A')).toBe('done');

        expect(store.match.state).toBe('finished');
        expect(store.match.endReason).toBe('surrender');
        expect(store.match.winnerRobotId).toBe(store.match.robotBId);
        expect(store.written).toHaveLength(1);
        expect(store.written[0]).toMatchObject({
            type: 'finished',
            occurredAt: at(60_000),
            actorUserId: null,
        });
        expect(changes).toEqual([{ matchId: MATCH_ID, arenaId: ARENA_ID }]);
    });

    it("surrender by B sets A's robot as winner", async () => {
        const { service, store } = ongoing();

        expect(await service.surrender(ARENA_ID, MATCH_ID, 'B')).toBe('done');

        expect(store.match.winnerRobotId).toBe(store.match.robotAId);
        expect(store.match.endReason).toBe('surrender');
    });

    it.each([
        ['scheduled', []],
        ['paused', [event('started', T0), event('paused', at(1000))]],
        ['finished', [event('started', T0), event('finished', at(1000))]],
    ] as [MatchState, MatchEvent[]][])(
        'rejects a %s match as not_ongoing, with no writes and no change',
        async (state, events) => {
            const { service, store, changes } = setup({
                state,
                events,
                arenaId: ARENA_ID,
                now: at(60_000),
            });

            expect(await service.surrender(ARENA_ID, MATCH_ID, 'A')).toBe(
                'not_ongoing',
            );
            expect(store.match.state).toBe(state);
            expect(store.written).toHaveLength(0);
            expect(changes).toEqual([]);
        },
    );

    it('rejects a press from another arena as not_current_match', async () => {
        const { service, store, changes } = ongoing();

        expect(await service.surrender(OTHER_ARENA_ID, MATCH_ID, 'A')).toBe(
            'not_current_match',
        );
        expect(store.match.state).toBe('ongoing');
        expect(store.written).toHaveLength(0);
        expect(changes).toEqual([]);
    });

    it('rejects a press on a match no arena points at as not_current_match', async () => {
        const { service, store, changes } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            now: at(60_000),
        });

        expect(await service.surrender(ARENA_ID, MATCH_ID, 'A')).toBe(
            'not_current_match',
        );
        expect(store.written).toHaveLength(0);
        expect(changes).toEqual([]);
    });

    it('rejects the matchId of another match as not_current_match', async () => {
        const { service, store, changes } = ongoing();

        expect(await service.surrender(ARENA_ID, OTHER_MATCH_ID, 'A')).toBe(
            'not_current_match',
        );
        expect(store.match.state).toBe('ongoing');
        expect(store.written).toHaveLength(0);
        expect(changes).toEqual([]);
    });

    it('rejects an unknown matchId as not_current_match', async () => {
        const { service, changes } = setup({ missing: true });

        expect(await service.surrender(ARENA_ID, OTHER_MATCH_ID, 'A')).toBe(
            'not_current_match',
        );
        expect(changes).toEqual([]);
    });

    it.each(['abc', '', null])(
        'surrender with matchId %j is not_current_match without touching the repository',
        async (matchId) => {
            const { service, repo, changes } = ongoing();

            expect(await service.surrender(ARENA_ID, matchId, 'A')).toBe(
                'not_current_match',
            );
            expect(repo.withLockedFight).not.toHaveBeenCalled();
            expect(repo.findMatch).not.toHaveBeenCalled();
            expect(changes).toEqual([]);
        },
    );

    it('surrender after time ran out is not_ongoing and writes the time-out', async () => {
        const { service, store, changes } = ongoing(at(180_000));

        expect(await service.surrender(ARENA_ID, MATCH_ID, 'A')).toBe(
            'not_ongoing',
        );
        expect(store.match.state).toBe('finished');
        expect(store.match.endReason).toBe('time_out');
        expect(store.match.winnerRobotId ?? null).toBeNull();
        expect(store.written.map((e) => e.type)).toEqual(['finished']);
        expect(changes).toEqual([{ matchId: MATCH_ID, arenaId: ARENA_ID }]);
    });

    it('a second surrender after the first is not_ongoing', async () => {
        const { service, store, changes } = ongoing();

        expect(await service.surrender(ARENA_ID, MATCH_ID, 'A')).toBe('done');
        expect(await service.surrender(ARENA_ID, MATCH_ID, 'B')).toBe(
            'not_ongoing',
        );

        expect(store.match.winnerRobotId).toBe(store.match.robotBId);
        expect(store.written).toHaveLength(1);
        expect(changes).toHaveLength(1);
    });

    it('stamps the surrender strictly after the latest event', async () => {
        const { service, store } = setup({
            state: 'ongoing',
            events: [event('started', at(60_000))],
            arenaId: ARENA_ID,
            now: at(60_000),
        });

        await service.surrender(ARENA_ID, MATCH_ID, 'A');

        expect(store.written[0].occurredAt).toEqual(at(60_001));
    });
});

describe('FightService time-out timer', () => {
    it('start arms the timer for 180_000 ms', async () => {
        const { service, timer } = setup({ now: at(1000) });

        await service.command(MATCH_ID, 'start', USER_ID);

        expect(timer.arm).toHaveBeenCalledWith(
            MATCH_ID,
            180_000,
            expect.any(Function),
        );
    });

    it('resume after 10 s of pause arms for the remaining time', async () => {
        const { service, timer } = setup({
            state: 'paused',
            events: [event('started', T0), event('paused', at(60_000))],
            now: at(70_000),
        });

        await service.command(MATCH_ID, 'resume', USER_ID);

        // 60 s fought, so 120 s left from now
        expect(timer.arm).toHaveBeenCalledWith(
            MATCH_ID,
            120_000,
            expect.any(Function),
        );
    });

    it('pause, finish and surrender cancel the timer', async () => {
        const a = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            now: at(1000),
        });
        await a.service.command(MATCH_ID, 'pause', USER_ID);
        expect(a.timer.cancel).toHaveBeenCalledWith(MATCH_ID);

        const b = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            now: at(1000),
        });
        await b.service.command(MATCH_ID, 'finish', USER_ID);
        expect(b.timer.cancel).toHaveBeenCalledWith(MATCH_ID);

        const c = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            arenaId: ARENA_ID,
            now: at(1000),
        });
        await c.service.surrender(ARENA_ID, MATCH_ID, 'A');
        expect(c.timer.cancel).toHaveBeenCalledWith(MATCH_ID);
    });

    it('onTimeOut settles the fight, emits and cancels', async () => {
        const { service, armed, clock, store, changes, timer } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            arenaId: ARENA_ID,
            now: at(1000),
        });
        await service.restoreTimeOuts();
        const fire = armed.get(MATCH_ID)?.onFire;
        expect(fire).toBeDefined();
        timer.cancel.mockClear();

        clock.current = at(180_000);
        fire?.();
        await vi.waitFor(() => expect(timer.cancel).toHaveBeenCalled());

        expect(store.match.state).toBe('finished');
        expect(store.match.endReason).toBe('time_out');
        expect(changes).toEqual([{ matchId: MATCH_ID, arenaId: ARENA_ID }]);
        expect(armed.has(MATCH_ID)).toBe(false);
    });

    it('onTimeOut that fires 5 ms early re-arms for 5 ms and writes nothing', async () => {
        const { service, armed, clock, store, changes, timer } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            now: at(1000),
        });
        await service.restoreTimeOuts();
        const fire = armed.get(MATCH_ID)?.onFire;
        timer.arm.mockClear();

        clock.current = at(179_995);
        fire?.();
        await vi.waitFor(() => expect(timer.arm).toHaveBeenCalled());

        expect(timer.arm).toHaveBeenCalledWith(
            MATCH_ID,
            5,
            expect.any(Function),
        );
        expect(store.written).toHaveLength(0);
        expect(store.match.state).toBe('ongoing');
        expect(changes).toEqual([]);
    });

    describe('restoreTimeOuts', () => {
        it('arms an ongoing match with time left', async () => {
            const { service, timer } = setup({
                state: 'ongoing',
                events: [event('started', T0)],
                now: at(30_000),
            });

            await service.restoreTimeOuts();

            expect(timer.arm).toHaveBeenCalledWith(
                MATCH_ID,
                150_000,
                expect.any(Function),
            );
        });

        it('settles and emits for an ongoing match that already expired', async () => {
            const { service, timer, armed, store, changes } = setup({
                state: 'ongoing',
                events: [event('started', T0)],
                arenaId: ARENA_ID,
                now: at(200_000),
            });

            await service.restoreTimeOuts();
            // The timer fires at once for a negative delay
            armed.get(MATCH_ID)?.onFire();
            await vi.waitFor(() => expect(changes).toHaveLength(1));

            expect(timer.arm).toHaveBeenCalledWith(
                MATCH_ID,
                expect.any(Number),
                expect.any(Function),
            );
            expect(store.match.state).toBe('finished');
            expect(changes).toEqual([{ matchId: MATCH_ID, arenaId: ARENA_ID }]);
        });

        it('keeps arming later matches after one fails', async () => {
            const { service, repo, timer } = setup({
                state: 'ongoing',
                events: [event('started', T0)],
                now: at(30_000),
            });
            const error = vi
                .spyOn(service.logger, 'error')
                .mockImplementation(() => {});
            repo.findOngoingIds.mockResolvedValue(['other-id', MATCH_ID]);
            repo.findMatch.mockRejectedValueOnce(new Error('db down'));

            await service.restoreTimeOuts();

            expect(error).toHaveBeenCalledWith(
                'fight_timer_sync_failed',
                expect.objectContaining({ matchId: 'other-id' }),
            );
            // The failed match gets a retry, the other its real deadline
            expect(timer.arm).toHaveBeenCalledTimes(2);
            expect(timer.arm).toHaveBeenCalledWith(
                'other-id',
                TIMER_RETRY_MS,
                expect.any(Function),
            );
            expect(timer.arm).toHaveBeenCalledWith(
                MATCH_ID,
                150_000,
                expect.any(Function),
            );
        });

        it('starts every match without waiting for the previous one', async () => {
            const { service, repo, store } = setup({
                state: 'ongoing',
                events: [event('started', T0)],
                now: at(30_000),
            });
            repo.findOngoingIds.mockResolvedValue(['other-id', MATCH_ID]);
            let release: (m: Match) => void = () => {};
            repo.findMatch.mockImplementationOnce(
                () =>
                    new Promise<Match>((resolve) => {
                        release = resolve;
                    }),
            );

            const restore = service.restoreTimeOuts();

            // The second match is read while the first is still held
            await vi.waitFor(() =>
                expect(repo.findMatch).toHaveBeenCalledTimes(2),
            );
            release(store.match);
            await restore;
        });

        it('ignores paused matches', async () => {
            const { service, timer } = setup({
                state: 'paused',
                events: [event('started', T0), event('paused', at(1000))],
            });

            await service.restoreTimeOuts();

            expect(timer.arm).not.toHaveBeenCalled();
        });
    });

    it('retries the time-out after settle fails', async () => {
        const { service, repo, armed, clock, store } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            now: at(1000),
        });
        vi.spyOn(service.logger, 'error').mockImplementation(() => {});
        await service.restoreTimeOuts();
        repo.withLockedFight.mockRejectedValueOnce(new Error('db down'));

        clock.current = at(180_000);
        armed.get(MATCH_ID)?.onFire();
        await vi.waitFor(() =>
            expect(armed.get(MATCH_ID)?.delayMs).toBe(TIMER_RETRY_MS),
        );
        armed.get(MATCH_ID)?.onFire();

        await vi.waitFor(() => expect(store.match.state).toBe('finished'));
        await vi.waitFor(() => expect(armed.has(MATCH_ID)).toBe(false));
        expect(store.match.endReason).toBe('time_out');
    });

    it('keeps retrying while settle keeps failing', async () => {
        const { service, repo, armed, clock, store, timer } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            now: at(1000),
        });
        vi.spyOn(service.logger, 'error').mockImplementation(() => {});
        await service.restoreTimeOuts();
        repo.withLockedFight
            .mockRejectedValueOnce(new Error('db down'))
            .mockRejectedValueOnce(new Error('db down'));
        clock.current = at(180_000);
        armed.get(MATCH_ID)?.onFire();
        await vi.waitFor(() =>
            expect(armed.get(MATCH_ID)?.delayMs).toBe(TIMER_RETRY_MS),
        );
        timer.arm.mockClear();

        // The retry fails too
        armed.get(MATCH_ID)?.onFire();
        await vi.waitFor(() =>
            expect(timer.arm).toHaveBeenCalledWith(
                MATCH_ID,
                TIMER_RETRY_MS,
                expect.any(Function),
            ),
        );
        armed.get(MATCH_ID)?.onFire();

        await vi.waitFor(() => expect(store.match.state).toBe('finished'));
    });

    it('a failed sync after a write arms a retry that arms the timer', async () => {
        const { service, repo, armed } = setup();
        vi.spyOn(service.logger, 'error').mockImplementation(() => {});
        repo.findEvents.mockRejectedValueOnce(new Error('db down'));

        await service.command(MATCH_ID, 'start', USER_ID);
        expect(armed.get(MATCH_ID)?.delayMs).toBe(TIMER_RETRY_MS);

        armed.get(MATCH_ID)?.onFire();
        await vi.waitFor(() =>
            expect(armed.get(MATCH_ID)?.delayMs).toBe(180_000),
        );
    });

    it('a sync in flight at shutdown does not arm a timer', async () => {
        const { service, repo, armed } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            now: at(1000),
        });
        let release: () => void = () => {};
        repo.findEvents.mockImplementationOnce(
            () =>
                new Promise<MatchEvent[]>((resolve) => {
                    release = () => resolve([event('started', T0)]);
                }),
        );
        const sync = (
            service as unknown as { syncTimer(id: string): Promise<void> }
        ).syncTimer(MATCH_ID);
        await vi.waitFor(() => expect(repo.findEvents).toHaveBeenCalled());

        service.onModuleDestroy();
        release();
        await sync;

        expect(armed.has(MATCH_ID)).toBe(false);
    });

    it('a time-out that fails after shutdown does not arm a retry', async () => {
        const { service, repo, armed, clock } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            now: at(1000),
        });
        const error = vi
            .spyOn(service.logger, 'error')
            .mockImplementation(() => {});
        await service.restoreTimeOuts();
        let fail: () => void = () => {};
        repo.withLockedFight.mockImplementationOnce(
            () =>
                new Promise<never>((_, reject) => {
                    fail = () => reject(new Error('pool closed'));
                }),
        );
        clock.current = at(180_000);
        armed.get(MATCH_ID)?.onFire();
        await vi.waitFor(() => expect(repo.withLockedFight).toHaveBeenCalled());

        service.onModuleDestroy();
        fail();
        await vi.waitFor(() =>
            expect(error).toHaveBeenCalledWith(
                'fight_timeout_failed',
                expect.objectContaining({ matchId: MATCH_ID }),
            ),
        );

        expect(armed.has(MATCH_ID)).toBe(false);
    });

    it('a failing settle inside onTimeOut is logged, not thrown', async () => {
        const { service, repo, armed, clock } = setup({
            state: 'ongoing',
            events: [event('started', T0)],
            now: at(1000),
        });
        const error = vi
            .spyOn(service.logger, 'error')
            .mockImplementation(() => {});
        await service.restoreTimeOuts();
        repo.findMatch.mockRejectedValueOnce(new Error('db down'));

        clock.current = at(180_000);
        armed.get(MATCH_ID)?.onFire();
        await vi.waitFor(() =>
            expect(error).toHaveBeenCalledWith(
                'fight_timeout_failed',
                expect.objectContaining({ matchId: MATCH_ID }),
            ),
        );
    });

    it('a stale sync that read paused cannot cancel the timer a newer sync armed', async () => {
        const { service, repo, store, timer, armed } = setup({
            state: 'paused',
            events: [event('started', T0), event('paused', at(60_000))],
            now: at(70_000),
        });
        const stale = store.match;
        let release: (m: Match) => void = () => {};
        repo.findMatch.mockImplementationOnce(
            () =>
                new Promise<Match>((resolve) => {
                    release = resolve;
                }),
        );
        // First sync: its findMatch snapshot is `paused`, held until after the resume
        const first = (
            service as unknown as { syncTimer(id: string): Promise<void> }
        ).syncTimer(MATCH_ID);
        const staleSnapshot = Object.assign(
            Object.create(Object.getPrototypeOf(stale) as object) as Match,
            stale,
        );

        await service.command(MATCH_ID, 'resume', USER_ID);
        expect(timer.arm).toHaveBeenCalledTimes(1);
        const delay = armed.get(MATCH_ID)?.delayMs;

        release(staleSnapshot);
        await first;

        expect(armed.has(MATCH_ID)).toBe(true);
        expect(armed.get(MATCH_ID)?.delayMs).toBe(delay);
        expect(timer.cancel).not.toHaveBeenCalled();
    });

    it('a stale sync cannot cancel the timer of a later sync after the generation entry was deleted', async () => {
        const { service, repo, store, timer, armed } = setup({
            state: 'paused',
            events: [event('started', T0), event('paused', at(60_000))],
            now: at(70_000),
        });
        const stale = store.match;
        let release: (m: Match) => void = () => {};
        repo.findMatch.mockImplementationOnce(
            () =>
                new Promise<Match>((resolve) => {
                    release = resolve;
                }),
        );
        const first = (
            service as unknown as { syncTimer(id: string): Promise<void> }
        ).syncTimer(MATCH_ID);
        const staleSnapshot = Object.assign(
            Object.create(Object.getPrototypeOf(stale) as object) as Match,
            stale,
        );

        await service.command(MATCH_ID, 'resume', USER_ID);
        await service.command(MATCH_ID, 'pause', USER_ID);
        // The pause's sync cancelled and deleted the generation entry
        expect(armed.has(MATCH_ID)).toBe(false);
        await service.command(MATCH_ID, 'resume', USER_ID);
        expect(armed.has(MATCH_ID)).toBe(true);
        const cancels = timer.cancel.mock.calls.length;

        release(staleSnapshot);
        await first;

        expect(armed.has(MATCH_ID)).toBe(true);
        expect(timer.cancel).toHaveBeenCalledTimes(cancels);
    });

    it('a failing syncTimer never fails the command', async () => {
        const { service, repo } = setup();
        const error = vi
            .spyOn(service.logger, 'error')
            .mockImplementation(() => {});
        // The command's own reads pass; the timer's re-read fails
        repo.findEvents.mockRejectedValueOnce(new Error('db down'));

        const state = await service
            .command(MATCH_ID, 'start', USER_ID)
            .catch(() => null);

        expect(error).toHaveBeenCalledWith(
            'fight_timer_sync_failed',
            expect.objectContaining({ matchId: MATCH_ID }),
        );
        expect(state).not.toBeNull();
    });

    it('a failing restore is logged and does not throw', async () => {
        const { service, repo } = setup();
        const error = vi
            .spyOn(service.logger, 'error')
            .mockImplementation(() => {});
        repo.findOngoingIds.mockRejectedValue(new Error('db down'));

        await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

        expect(error).toHaveBeenCalledWith(
            'fight_timer_restore_failed',
            expect.anything(),
        );
    });
});

describe('FightEvents', () => {
    it('calls listeners in order, survives a throwing one, and unsubscribes', () => {
        const events = new FightEvents();
        const warn = vi
            .spyOn(events.logger, 'warn')
            .mockImplementation(() => {});
        const calls: string[] = [];
        events.onChange(() => calls.push('first'));
        events.onChange(() => {
            throw new Error('boom');
        });
        const off = events.onChange(() => calls.push('third'));
        const change = { matchId: MATCH_ID, arenaId: ARENA_ID };

        events.emit(change);
        off();
        events.emit(change);

        expect(calls).toEqual(['first', 'third', 'first']);
        expect(warn).toHaveBeenCalledWith(
            'fight_listener_failed',
            expect.objectContaining({ matchId: MATCH_ID }),
        );
    });
});
