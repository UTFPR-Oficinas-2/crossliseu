import 'reflect-metadata';
import { ChampionshipsService } from './championships.service.js';
import { Championship } from './entities/championship.entity.js';
import type { ChampionshipsRepository } from './championships.repository.js';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function championship(startDate: Date, endDate: Date): Championship {
    const entity = new Championship('Copa', startDate, endDate, USER_ID);
    entity.id = CHAMPIONSHIP_ID;
    return entity;
}

function setup(stored: Championship[] = []) {
    const championshipsRepository = {
        create: vi.fn((entity: Championship) => {
            entity.id = CHAMPIONSHIP_ID;
            stored.push(entity);
            return Promise.resolve(entity);
        }),
        findAll: vi.fn(() => Promise.resolve(stored)),
        findOne: vi.fn((id: string) =>
            Promise.resolve(stored.find((entity) => entity.id === id) ?? null),
        ),
        countRobotsAndMatches: vi.fn().mockResolvedValue(new Map()),
    };
    const service = new ChampionshipsService(
        championshipsRepository as unknown as ChampionshipsRepository,
    );

    return { service, championshipsRepository };
}

describe('ChampionshipsService', () => {
    it('derives a closed status from dates in the past', async () => {
        const { service } = setup([
            championship(
                new Date('2020-01-01T00:00:00Z'),
                new Date('2020-01-02T00:00:00Z'),
            ),
        ]);

        const found = await service.findOne(CHAMPIONSHIP_ID);

        expect(found.status).toBe('closed');
    });

    it('derives a scheduled status for every championship listed', async () => {
        const { service } = setup([
            championship(
                new Date('2999-01-01T00:00:00Z'),
                new Date('2999-01-02T00:00:00Z'),
            ),
        ]);

        const [listed] = await service.findAll();

        expect(listed.status).toBe('scheduled');
    });

    it('saves the creator and returns the championship with status and counts', async () => {
        const { service, championshipsRepository } = setup();

        const created = await service.create(
            {
                name: 'Copa',
                startDate: new Date('2020-01-01T00:00:00Z'),
                endDate: new Date('2020-01-02T00:00:00Z'),
            },
            USER_ID,
        );

        expect(championshipsRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ createdByUserId: USER_ID }),
        );
        expect(created).toMatchObject({
            id: CHAMPIONSHIP_ID,
            createdByUserId: USER_ID,
            status: 'closed',
            robotCount: 0,
            fightsTotal: 0,
            fightsDone: 0,
        });
    });
});
