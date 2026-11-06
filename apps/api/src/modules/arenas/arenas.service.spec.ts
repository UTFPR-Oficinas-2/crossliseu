import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ArenasService } from './arenas.service.js';
import { Arena } from './entities/arena.entity.js';
import type { Match } from '../matches/entities/match.entity.js';
import type {
    ArenasRepository,
    SetCurrentMatchResult,
} from './arenas.repository.js';

const ARENA_1_ID = '11111111-1111-4111-8111-111111111111';
const ARENA_2_ID = '22222222-2222-4222-8222-222222222222';
const OWNER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MATCH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_MATCH_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function matchStub(id: string): Match {
    return {
        id,
        robotA: { name: 'Titã' },
        robotB: { name: 'Marte' },
    } as Match;
}

function arena(id: string, name: string, currentMatchId: string | null) {
    const entity = new Arena(name, `${name}-device`, 'bcrypt-hash', OWNER_ID);
    entity.id = id;
    entity.currentMatchId = currentMatchId;
    if (currentMatchId) {
        entity.currentMatch = matchStub(currentMatchId);
    }
    return entity;
}

function setup(
    arenas: Arena[],
    { setResult = 'done' }: { setResult?: SetCurrentMatchResult } = {},
) {
    const arenasRepository = {
        // Applies the pointer change only on 'done', like the locked transaction
        setCurrentMatch: vi.fn(
            (arenaId: string, matchId: string, _ownerUserId: string) => {
                const target = arenas.find((entity) => entity.id === arenaId);
                if (setResult === 'done' && target) {
                    target.currentMatchId = matchId;
                    target.currentMatch = matchStub(matchId);
                }
                return Promise.resolve(setResult);
            },
        ),
        clearCurrentMatch: vi.fn((arenaId: string) => {
            const target = arenas.find((entity) => entity.id === arenaId);
            if (target) {
                target.currentMatchId = null;
            }
            return Promise.resolve(target !== undefined);
        }),
        findByOwner: vi.fn((_ownerUserId: string) => Promise.resolve(arenas)),
        findOwned: vi.fn((id: string, _ownerUserId: string) =>
            Promise.resolve(arenas.find((entity) => entity.id === id) ?? null),
        ),
    };
    const service = new ArenasService(
        arenasRepository as unknown as ArenasRepository,
    );
    return { service, arenasRepository };
}

describe('ArenasService.findAll', () => {
    it('lists the owner arenas as offline with their current match', async () => {
        const { service, arenasRepository } = setup([
            arena(ARENA_1_ID, 'Arena 1', MATCH_ID),
            arena(ARENA_2_ID, 'Arena 2', null),
        ]);

        expect(await service.findAll('user-a')).toEqual([
            {
                id: ARENA_1_ID,
                name: 'Arena 1',
                deviceId: 'Arena 1-device',
                online: false,
                currentMatchId: MATCH_ID,
                currentMatch: {
                    id: MATCH_ID,
                    robotAName: 'Titã',
                    robotBName: 'Marte',
                },
            },
            {
                id: ARENA_2_ID,
                name: 'Arena 2',
                deviceId: 'Arena 2-device',
                online: false,
                currentMatchId: null,
                currentMatch: null,
            },
        ]);
        expect(arenasRepository.findByOwner).toHaveBeenCalledWith('user-a');
    });

    it('never exposes the token hash', async () => {
        const { service } = setup([arena(ARENA_1_ID, 'Arena 1', null)]);

        const [result] = await service.findAll('user-a');

        expect(Object.keys(result!)).toEqual([
            'id',
            'name',
            'deviceId',
            'online',
            'currentMatchId',
            'currentMatch',
        ]);
    });
});

describe('ArenasService.setCurrentMatch', () => {
    it('returns the arena pointing at the selected match', async () => {
        const { service, arenasRepository } = setup([
            arena(ARENA_1_ID, 'Arena 1', null),
        ]);

        expect(
            await service.setCurrentMatch(
                ARENA_1_ID,
                { matchId: MATCH_ID },
                'user-a',
            ),
        ).toEqual({
            id: ARENA_1_ID,
            name: 'Arena 1',
            deviceId: 'Arena 1-device',
            online: false,
            currentMatchId: MATCH_ID,
            currentMatch: {
                id: MATCH_ID,
                robotAName: 'Titã',
                robotBName: 'Marte',
            },
        });
        expect(arenasRepository.setCurrentMatch).toHaveBeenCalledWith(
            ARENA_1_ID,
            MATCH_ID,
            'user-a',
        );
    });

    it.each([
        ['arena_not_found', NotFoundException],
        ['match_not_found', NotFoundException],
        ['match_not_scheduled', ConflictException],
        ['match_already_current', ConflictException],
        ['arena_match_started', ConflictException],
    ] as const)(
        'turns %s into %o and leaves the pointer alone',
        async (result, exception) => {
            const current = arena(ARENA_1_ID, 'Arena 1', OTHER_MATCH_ID);
            const { service } = setup([current], { setResult: result });

            const call = service.setCurrentMatch(
                ARENA_1_ID,
                { matchId: MATCH_ID },
                'user-a',
            );

            await expect(call).rejects.toThrow(exception);
            await expect(call).rejects.toThrow(result);
            expect(current.currentMatchId).toBe(OTHER_MATCH_ID);
        },
    );
});

describe('ArenasService.clearCurrentMatch', () => {
    it('clears the pointer', async () => {
        const current = arena(ARENA_1_ID, 'Arena 1', MATCH_ID);
        const { service } = setup([current]);

        await service.clearCurrentMatch(ARENA_1_ID);

        expect(current.currentMatchId).toBeNull();
    });

    it('rejects an unknown arena with arena_not_found', async () => {
        const { service } = setup([]);

        const call = service.clearCurrentMatch(ARENA_1_ID);

        await expect(call).rejects.toThrow(NotFoundException);
        await expect(call).rejects.toThrow('arena_not_found');
    });
});
