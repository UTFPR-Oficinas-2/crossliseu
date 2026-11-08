import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ArenasService } from './arenas.service.js';
import { Arena } from './entities/arena.entity.js';
import { ArenaConnections } from './device/arena-connections.js';
import type { DeviceSocket } from './device/arena-connections.js';
import type { Match } from '../matches/entities/match.entity.js';
import * as bcrypt from 'bcrypt';
import type {
    ArenasRepository,
    CreateArenaResult,
    LockedArenaResult,
    RenameArenaResult,
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
    {
        setResult = 'done',
        createResults = ['done'],
        renameResult = 'done',
        lockedResult = 'done',
    }: {
        setResult?: SetCurrentMatchResult;
        createResults?: CreateArenaResult[];
        renameResult?: RenameArenaResult;
        lockedResult?: LockedArenaResult;
    } = {},
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
        // Applies the clear only on 'done', like the locked transaction
        clearCurrentMatch: vi.fn(
            (arenaId: string, _ownerUserId: string | null) => {
                const target = arenas.find((entity) => entity.id === arenaId);
                if (lockedResult === 'done' && target) {
                    target.currentMatchId = null;
                    target.currentMatch = null;
                }
                return Promise.resolve(lockedResult);
            },
        ),
        create: vi.fn((_arena: Arena) =>
            Promise.resolve(createResults.shift() ?? 'done'),
        ),
        rename: vi.fn((id: string, _ownerUserId: string, name: string) => {
            const target = arenas.find((entity) => entity.id === id);
            if (renameResult === 'done' && target) {
                target.name = name;
            }
            return Promise.resolve(renameResult);
        }),
        rotateToken: vi.fn(
            (_id: string, _ownerUserId: string, _tokenHash: string) =>
                Promise.resolve(lockedResult),
        ),
        remove: vi.fn((_id: string, _ownerUserId: string) =>
            Promise.resolve(lockedResult),
        ),
        findByOwner: vi.fn((_ownerUserId: string) => Promise.resolve(arenas)),
        findLiveByDeviceId: vi.fn((deviceId: string) =>
            Promise.resolve(
                arenas.find((entity) => entity.deviceId === deviceId) ?? null,
            ),
        ),
        findOwned: vi.fn((id: string, _ownerUserId: string) =>
            Promise.resolve(arenas.find((entity) => entity.id === id) ?? null),
        ),
    };
    const connections = new ArenaConnections();
    const service = new ArenasService(
        arenasRepository as unknown as ArenasRepository,
        connections,
    );
    return { service, arenasRepository, connections };
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

    it('reports online for an arena with a live connection', async () => {
        const { service, connections } = setup([
            arena(ARENA_1_ID, 'Arena 1', null),
            arena(ARENA_2_ID, 'Arena 2', null),
        ]);
        connections.claim(ARENA_1_ID, {} as DeviceSocket);

        const result = await service.findAll('user-a');

        expect(result.map(({ id, online }) => ({ id, online }))).toEqual([
            { id: ARENA_1_ID, online: true },
            { id: ARENA_2_ID, online: false },
        ]);
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
    it('returns the arena without a current match', async () => {
        const { service, arenasRepository } = setup([
            arena(ARENA_1_ID, 'Arena 1', MATCH_ID),
        ]);

        const response = await service.clearCurrentMatch(ARENA_1_ID, OWNER_ID);

        expect(response).toMatchObject({
            id: ARENA_1_ID,
            online: false,
            currentMatchId: null,
            currentMatch: null,
        });
        expect(arenasRepository.clearCurrentMatch).toHaveBeenCalledWith(
            ARENA_1_ID,
            OWNER_ID,
        );
    });

    it.each([
        ['arena_not_found', NotFoundException],
        ['arena_match_live', ConflictException],
    ] as const)('turns %s into %o', async (lockedResult, exception) => {
        const { service } = setup([arena(ARENA_1_ID, 'Arena 1', MATCH_ID)], {
            lockedResult,
        });

        const call = service.clearCurrentMatch(ARENA_1_ID, OWNER_ID);

        await expect(call).rejects.toThrow(exception);
        await expect(call).rejects.toThrow(lockedResult);
    });
});

describe('ArenasService.releaseCurrentMatch', () => {
    it('clears without an account check', async () => {
        const { service, arenasRepository } = setup([
            arena(ARENA_1_ID, 'Arena 1', MATCH_ID),
        ]);

        await expect(
            service.releaseCurrentMatch(ARENA_1_ID),
        ).resolves.toBeUndefined();
        expect(arenasRepository.clearCurrentMatch).toHaveBeenCalledWith(
            ARENA_1_ID,
            null,
        );
    });

    it('turns arena_match_live into a ConflictException', async () => {
        const { service } = setup([arena(ARENA_1_ID, 'Arena 1', MATCH_ID)], {
            lockedResult: 'arena_match_live',
        });

        const call = service.releaseCurrentMatch(ARENA_1_ID);

        await expect(call).rejects.toThrow(ConflictException);
        await expect(call).rejects.toThrow('arena_match_live');
    });
});

describe('ArenasService.create', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('returns one-time credentials and stores only the token hash', async () => {
        vi.stubEnv('ARENA_SERVER_URL', 'wss://example.test/arena');
        const { service, arenasRepository } = setup([]);

        const { arena: created, credentials } = await service.create(
            { name: 'Arena da garagem' },
            'user-a',
        );

        expect(credentials.token).toMatch(/^[0-9a-f]{64}$/);
        expect(credentials.deviceId).toMatch(/^arena-da-garagem-[0-9a-f]{4}$/);
        expect(credentials.serverUrl).toBe('wss://example.test/arena');
        const saved = arenasRepository.create.mock.calls[0]![0];
        expect(saved.ownerUserId).toBe('user-a');
        expect(saved.tokenHash).not.toBe(credentials.token);
        expect(await bcrypt.compare(credentials.token, saved.tokenHash)).toBe(
            true,
        );
        expect(created).toEqual({
            id: saved.id,
            name: 'Arena da garagem',
            deviceId: credentials.deviceId,
            online: false,
            currentMatchId: null,
            currentMatch: null,
        });
    });

    it.each([undefined, ''])(
        'has a null serverUrl when it is %j',
        async (value) => {
            vi.stubEnv('ARENA_SERVER_URL', value);
            const { service } = setup([]);

            const { credentials } = await service.create(
                { name: 'A' },
                'user-a',
            );

            expect(credentials.serverUrl).toBeNull();
        },
    );

    it('retries once with a new device id when it is taken', async () => {
        const { service, arenasRepository } = setup([], {
            createResults: ['device_id_taken', 'done'],
        });

        const { credentials } = await service.create({ name: 'A' }, 'user-a');

        const [first, second] = arenasRepository.create.mock.calls.map(
            ([entity]) => entity.deviceId,
        );
        expect(arenasRepository.create).toHaveBeenCalledTimes(2);
        expect(second).not.toBe(first);
        expect(credentials.deviceId).toBe(second);
    });

    it('gives up after 5 attempts with a server error', async () => {
        const { service, arenasRepository } = setup([], {
            createResults: Array(5).fill('device_id_taken'),
        });

        await expect(service.create({ name: 'A' }, 'user-a')).rejects.toThrow(
            Error,
        );
        expect(arenasRepository.create).toHaveBeenCalledTimes(5);
    });

    it('turns arena_name_taken into a 409', async () => {
        const { service } = setup([], { createResults: ['arena_name_taken'] });

        const call = service.create({ name: 'A' }, 'user-a');

        await expect(call).rejects.toThrow(ConflictException);
        await expect(call).rejects.toThrow('arena_name_taken');
    });
});

describe('ArenasService.rename', () => {
    it('renames and returns the arena', async () => {
        const { service, arenasRepository } = setup([
            arena(ARENA_1_ID, 'Arena 1', null),
        ]);

        const result = await service.rename(
            ARENA_1_ID,
            { name: 'Nova' },
            'user-a',
        );

        expect(result.name).toBe('Nova');
        expect(result.deviceId).toBe('Arena 1-device');
        expect(arenasRepository.rename).toHaveBeenCalledWith(
            ARENA_1_ID,
            'user-a',
            'Nova',
        );
    });

    it.each([
        ['arena_not_found', NotFoundException],
        ['arena_name_taken', ConflictException],
    ] as const)('turns %s into %o', async (renameResult, exception) => {
        const { service } = setup([arena(ARENA_1_ID, 'Arena 1', null)], {
            renameResult,
        });

        const call = service.rename(ARENA_1_ID, { name: 'Nova' }, 'user-a');

        await expect(call).rejects.toThrow(exception);
        await expect(call).rejects.toThrow(renameResult);
    });
});

describe('ArenasService.rotateToken', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('returns fresh credentials for the same device id and stores only the hash', async () => {
        vi.stubEnv('ARENA_SERVER_URL', 'wss://example.test/arena');
        const { service, arenasRepository } = setup([
            arena(ARENA_1_ID, 'Arena 1', null),
        ]);

        const credentials = await service.rotateToken(ARENA_1_ID, 'user-a');

        expect(credentials.deviceId).toBe('Arena 1-device');
        expect(credentials.token).toMatch(/^[0-9a-f]{64}$/);
        expect(credentials.serverUrl).toBe('wss://example.test/arena');
        const [id, owner, hash] = arenasRepository.rotateToken.mock.calls[0]!;
        expect([id, owner]).toEqual([ARENA_1_ID, 'user-a']);
        expect(hash).not.toBe(credentials.token);
        expect(await bcrypt.compare(credentials.token, hash)).toBe(true);
    });

    it.each([
        ['arena_not_found', NotFoundException],
        ['arena_match_live', ConflictException],
    ] as const)('turns %s into %o', async (lockedResult, exception) => {
        const { service } = setup([arena(ARENA_1_ID, 'Arena 1', null)], {
            lockedResult,
        });

        const call = service.rotateToken(ARENA_1_ID, 'user-a');

        await expect(call).rejects.toThrow(exception);
        await expect(call).rejects.toThrow(lockedResult);
    });
});

describe('ArenasService.remove', () => {
    it('removes the arena of the account', async () => {
        const { service, arenasRepository } = setup([
            arena(ARENA_1_ID, 'Arena 1', null),
        ]);

        await service.remove(ARENA_1_ID, 'user-a');

        expect(arenasRepository.remove).toHaveBeenCalledWith(
            ARENA_1_ID,
            'user-a',
        );
    });

    it.each([
        ['arena_not_found', NotFoundException],
        ['arena_match_live', ConflictException],
    ] as const)('turns %s into %o', async (lockedResult, exception) => {
        const { service } = setup([arena(ARENA_1_ID, 'Arena 1', null)], {
            lockedResult,
        });

        const call = service.remove(ARENA_1_ID, 'user-a');

        await expect(call).rejects.toThrow(exception);
        await expect(call).rejects.toThrow(lockedResult);
    });
});

describe('ArenasService.authenticateDevice', () => {
    async function deviceArena() {
        const entity = arena(ARENA_1_ID, 'Arena 01', null);
        entity.tokenHash = await bcrypt.hash('right-token', 4);
        return entity;
    }

    it('returns id and name for the right token', async () => {
        const { service } = setup([await deviceArena()]);

        expect(
            await service.authenticateDevice('Arena 01-device', 'right-token'),
        ).toEqual({ id: ARENA_1_ID, name: 'Arena 01' });
    });

    it('returns null for a wrong token', async () => {
        const { service } = setup([await deviceArena()]);

        expect(
            await service.authenticateDevice('Arena 01-device', 'wrong-token'),
        ).toBeNull();
    });

    it('returns null for an unknown device id', async () => {
        const { service, arenasRepository } = setup([await deviceArena()]);

        expect(
            await service.authenticateDevice('ghost-device', 'right-token'),
        ).toBeNull();
        expect(arenasRepository.findLiveByDeviceId).toHaveBeenCalledWith(
            'ghost-device',
        );
    });

    it('logs the device id, never the token', async () => {
        const { service } = setup([await deviceArena()]);
        const warn = vi
            .spyOn(service.logger, 'warn')
            .mockImplementation(() => {});

        await service.authenticateDevice('Arena 01-device', 'wrong-token');

        const logged = warn.mock.calls.map((args) => JSON.stringify(args));
        expect(logged.some((line) => line.includes('Arena 01-device'))).toBe(
            true,
        );
        expect(logged.some((line) => line.includes('wrong-token'))).toBe(false);
    });
});
