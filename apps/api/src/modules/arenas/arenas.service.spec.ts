import 'reflect-metadata';
import { ArenasService } from './arenas.service.js';
import { Arena } from './entities/arena.entity.js';
import type { ArenasRepository } from './arenas.repository.js';

const ARENA_1_ID = '11111111-1111-4111-8111-111111111111';
const ARENA_2_ID = '22222222-2222-4222-8222-222222222222';
const MATCH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function arena(id: string, name: string, currentMatchId: string | null) {
    const entity = new Arena(name, `${name}-device`, 'bcrypt-hash');
    entity.id = id;
    entity.currentMatchId = currentMatchId;
    return entity;
}

function setup(arenas: Arena[]) {
    const arenasRepository = {
        findAll: vi.fn(() => Promise.resolve(arenas)),
        findOne: vi.fn((id: string) =>
            Promise.resolve(arenas.find((entity) => entity.id === id) ?? null),
        ),
    };
    const service = new ArenasService(
        arenasRepository as unknown as ArenasRepository,
    );
    return { service, arenasRepository };
}

describe('ArenasService.findAll', () => {
    it('lists arenas as offline with their current match', async () => {
        const { service } = setup([
            arena(ARENA_1_ID, 'Arena 1', MATCH_ID),
            arena(ARENA_2_ID, 'Arena 2', null),
        ]);

        expect(await service.findAll()).toEqual([
            {
                id: ARENA_1_ID,
                name: 'Arena 1',
                online: false,
                currentMatchId: MATCH_ID,
            },
            {
                id: ARENA_2_ID,
                name: 'Arena 2',
                online: false,
                currentMatchId: null,
            },
        ]);
    });

    it('never exposes the device id or the token hash', async () => {
        const { service } = setup([arena(ARENA_1_ID, 'Arena 1', null)]);

        const [result] = await service.findAll();

        expect(Object.keys(result!)).toEqual([
            'id',
            'name',
            'online',
            'currentMatchId',
        ]);
    });
});
