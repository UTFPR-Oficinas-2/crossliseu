import 'reflect-metadata';
import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { ChampionshipsService } from './championships.service.js';
import { Championship } from './entities/championship.entity.js';
import type {
    ChampionshipCounts,
    ChampionshipsRepository,
} from './championships.repository.js';

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function championship(
    id = ID,
    startDate = new Date('2026-11-04T00:00:00Z'),
    endDate = new Date('2026-11-06T00:00:00Z'),
): Championship {
    const entity = new Championship('Copa', startDate, endDate, USER_ID);
    entity.id = id;
    return entity;
}

function setup(
    championships: Championship[],
    counts = new Map<string, ChampionshipCounts>(),
) {
    const championshipsRepository = {
        create: vi.fn((entity: Championship) => {
            entity.id = ID;
            championships.push(entity);
            return Promise.resolve(entity);
        }),
        findAll: vi.fn().mockResolvedValue(championships),
        findOne: vi.fn((id: string) =>
            Promise.resolve(championships.find((c) => c.id === id) ?? null),
        ),
        countRobotsAndMatches: vi.fn().mockResolvedValue(counts),
        update: vi.fn().mockResolvedValue(undefined),
        removeCascade: vi.fn().mockResolvedValue('done'),
    };
    const service = new ChampionshipsService(
        championshipsRepository as unknown as ChampionshipsRepository,
    );
    const warn = vi.spyOn(service.logger, 'warn').mockImplementation(() => {});
    const error = vi
        .spyOn(service.logger, 'error')
        .mockImplementation(() => {});
    return { service, championshipsRepository, warn, error };
}

describe('ChampionshipsService status', () => {
    it('derives a closed status from dates in the past', async () => {
        const { service } = setup([
            championship(
                ID,
                new Date('2020-01-01T00:00:00Z'),
                new Date('2020-01-02T00:00:00Z'),
            ),
        ]);

        const found = await service.findOne(ID);

        expect(found.status).toBe('closed');
    });

    it('derives a scheduled status for every championship listed', async () => {
        const { service } = setup([
            championship(
                ID,
                new Date('2999-01-01T00:00:00Z'),
                new Date('2999-01-02T00:00:00Z'),
            ),
        ]);

        const [listed] = await service.findAll();

        expect(listed.status).toBe('scheduled');
    });
});

describe('ChampionshipsService.create', () => {
    it('saves the creator and returns the championship with status and counts', async () => {
        const { service, championshipsRepository } = setup([]);

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
            id: ID,
            name: 'Copa',
            createdByUserId: USER_ID,
            status: 'closed',
            robotCount: 0,
            fightsTotal: 0,
            fightsDone: 0,
        });
    });

    it('rejects an end date before the start date', async () => {
        const { service, championshipsRepository } = setup([]);

        await expect(
            service.create(
                {
                    name: 'Copa',
                    startDate: new Date('2026-11-05T00:00:00Z'),
                    endDate: new Date('2026-11-04T00:00:00Z'),
                },
                USER_ID,
            ),
        ).rejects.toThrow(
            new BadRequestException('championship_end_before_start'),
        );
        expect(championshipsRepository.create).not.toHaveBeenCalled();
    });
});

describe('ChampionshipsService.update', () => {
    it('checks a new end date against the stored start date', async () => {
        const { service, championshipsRepository } = setup([championship()]);

        await expect(
            service.update(ID, { endDate: new Date('2026-11-01T00:00:00Z') }),
        ).rejects.toThrow(
            new BadRequestException('championship_end_before_start'),
        );
        expect(championshipsRepository.update).not.toHaveBeenCalled();
    });

    it('saves a valid change and returns the reloaded championship', async () => {
        const { service, championshipsRepository } = setup([championship()]);

        const updated = await service.update(ID, { name: 'Copa II' });

        expect(championshipsRepository.update).toHaveBeenCalledWith(ID, {
            name: 'Copa II',
        });
        expect(updated.id).toBe(ID);
    });

    it('rejects an unknown championship', async () => {
        const { service } = setup([]);

        await expect(service.update(ID, { name: 'X' })).rejects.toThrow(
            new NotFoundException('championship_not_found'),
        );
    });
});

describe('ChampionshipsService counts', () => {
    it('adds the counts to each championship, with zeros when there are none', async () => {
        const { service } = setup(
            [championship(ID), championship(OTHER_ID)],
            new Map([[ID, { robotCount: 2, fightsTotal: 3, fightsDone: 1 }]]),
        );

        const [first, second] = await service.findAll();

        expect(first).toMatchObject({
            robotCount: 2,
            fightsTotal: 3,
            fightsDone: 1,
        });
        expect(second).toMatchObject({
            robotCount: 0,
            fightsTotal: 0,
            fightsDone: 0,
        });
    });

    it('logs an unknown championship at warn, not error', async () => {
        const { service, warn, error } = setup([]);

        await expect(service.findOne(ID)).rejects.toThrow(
            new NotFoundException('championship_not_found'),
        );
        expect(warn).toHaveBeenCalledWith('championship_not_found', { id: ID });
        expect(error).not.toHaveBeenCalled();
    });
});

describe('ChampionshipsService.remove', () => {
    it('removes the championship with its robots and matches', async () => {
        const { service, championshipsRepository } = setup([championship()]);

        await expect(service.remove(ID)).resolves.toBeUndefined();
        expect(championshipsRepository.removeCascade).toHaveBeenCalledWith(ID);
    });

    it('refuses while a match is ongoing or paused', async () => {
        const { service, championshipsRepository, error } = setup([
            championship(),
        ]);
        championshipsRepository.removeCascade.mockResolvedValueOnce(
            'has_live_match',
        );

        await expect(service.remove(ID)).rejects.toThrow(
            new ConflictException('championship_has_live_match'),
        );
        expect(error).toHaveBeenCalledWith('championship_has_live_match', {
            id: ID,
        });
    });

    it('reports a championship deleted in the meantime as not found', async () => {
        const { service, championshipsRepository } = setup([championship()]);
        championshipsRepository.removeCascade.mockResolvedValueOnce(
            'not_found',
        );

        await expect(service.remove(ID)).rejects.toThrow(
            new NotFoundException('championship_not_found'),
        );
    });
});
