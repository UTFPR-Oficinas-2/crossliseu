import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { FightService } from './fight.service.js';
import type {
    FightRepository,
    FightWrites,
    LockedFight,
} from './fight.repository.js';
import { Clock } from './clock.js';
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
        findMatch: vi.fn(() => Promise.resolve(missing ? null : store.match)),
        findWithRobots: vi.fn(() =>
            Promise.resolve(missing ? null : store.match),
        ),
        findEvents: vi.fn(() => Promise.resolve([...store.events])),
        withLockedFight: vi.fn(
            async (
                _id: string,
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
                            arenaId: store.arenaPointer,
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
    const service = new FightService(
        repo as unknown as FightRepository,
        championships as unknown as ChampionshipsService,
        clock,
    );
    return { service, repo, store, championships };
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
