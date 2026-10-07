import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { RobotsService } from './robots.service.js';
import { Robot } from './entities/robot.entity.js';
import type { RobotsRepository } from './robots.repository.js';
import type { ChampionshipsService } from '../championships/championships.service.js';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CHAMPIONSHIP_ID = '22222222-2222-4222-8222-222222222222';
const TITA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MARTE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function robot(
    id: string,
    name: string,
    championshipId = CHAMPIONSHIP_ID,
): Robot {
    const entity = new Robot(
        name,
        'lightweight',
        'Equipe Volt',
        championshipId,
    );
    entity.id = id;
    return entity;
}

function setup(
    robots: Robot[],
    { hasMatches = false }: { hasMatches?: boolean } = {},
) {
    const robotsRepository = {
        create: vi.fn((entity: Robot) => Promise.resolve(entity)),
        findOne: vi.fn((id: string) =>
            Promise.resolve(robots.find((entity) => entity.id === id) ?? null),
        ),
        // Case-insensitive, like the LOWER(name) query
        findByName: vi.fn((championshipId: string, name: string) =>
            Promise.resolve(
                robots.find(
                    (entity) =>
                        entity.championshipId === championshipId &&
                        entity.name.toLowerCase() === name.toLowerCase(),
                ) ?? null,
            ),
        ),
        hasMatches: vi.fn().mockResolvedValue(hasMatches),
        update: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
    };
    const championshipsService = {
        findOne: vi.fn().mockResolvedValue({ id: CHAMPIONSHIP_ID }),
    };
    const service = new RobotsService(
        robotsRepository as unknown as RobotsRepository,
        championshipsService as unknown as ChampionshipsService,
    );

    return { service, robotsRepository, championshipsService };
}

// What pg raises when the second of two racing saves hits the unique name index
const uniqueViolation = () =>
    new QueryFailedError(
        'INSERT INTO "robots"',
        [],
        Object.assign(new Error('duplicate key value'), { code: '23505' }),
    );

const createDto = {
    name: 'Titã',
    weightClass: 'lightweight' as const,
    team: 'Equipe Volt',
    championshipId: CHAMPIONSHIP_ID,
};

describe('RobotsService.create', () => {
    it('saves the robot in its championship', async () => {
        const { service, robotsRepository, championshipsService } = setup([]);

        const created = await service.create(createDto);

        expect(championshipsService.findOne).toHaveBeenCalledWith(
            CHAMPIONSHIP_ID,
        );
        expect(robotsRepository.create).toHaveBeenCalledOnce();
        expect(created).toMatchObject(createDto);
    });

    it('rejects a name already used in the championship, ignoring case', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);

        await expect(
            service.create({ ...createDto, name: 'TITÃ' }),
        ).rejects.toThrow(new ConflictException('robot_name_taken'));
        expect(robotsRepository.create).not.toHaveBeenCalled();
    });

    it('allows a name used in another championship', async () => {
        const { service, robotsRepository } = setup([
            robot(TITA_ID, 'Titã', OTHER_CHAMPIONSHIP_ID),
        ]);

        await service.create(createDto);

        expect(robotsRepository.create).toHaveBeenCalledOnce();
    });

    it('reports a save that lost a race on the unique index as robot_name_taken', async () => {
        const { service, robotsRepository } = setup([]);
        robotsRepository.create.mockRejectedValue(uniqueViolation());

        await expect(service.create(createDto)).rejects.toThrow(
            new ConflictException('robot_name_taken'),
        );
    });

    it('rejects an unknown championship', async () => {
        const { service, robotsRepository, championshipsService } = setup([]);
        championshipsService.findOne.mockRejectedValue(
            new NotFoundException('championship_not_found'),
        );

        await expect(service.create(createDto)).rejects.toThrow(
            new NotFoundException('championship_not_found'),
        );
        expect(robotsRepository.create).not.toHaveBeenCalled();
    });
});

describe('RobotsService.update', () => {
    it('lets a robot keep its own name with different case', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);

        await service.update(TITA_ID, { name: 'TITÃ' });

        expect(robotsRepository.update).toHaveBeenCalledWith(TITA_ID, {
            name: 'TITÃ',
        });
    });

    it('rejects the name of another robot in the championship', async () => {
        const { service, robotsRepository } = setup([
            robot(TITA_ID, 'Titã'),
            robot(MARTE_ID, 'Marte'),
        ]);

        await expect(
            service.update(MARTE_ID, { name: 'titã' }),
        ).rejects.toThrow(new ConflictException('robot_name_taken'));
        expect(robotsRepository.update).not.toHaveBeenCalled();
    });

    it('skips the name check when the name is not changing', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);

        await service.update(TITA_ID, { team: 'Equipe Nova' });

        expect(robotsRepository.findByName).not.toHaveBeenCalled();
        expect(robotsRepository.update).toHaveBeenCalledWith(TITA_ID, {
            team: 'Equipe Nova',
        });
    });

    it('maps a unique index race on update to robot_name_taken', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);
        robotsRepository.update.mockRejectedValue(uniqueViolation());

        await expect(
            service.update(TITA_ID, { name: 'Marte' }),
        ).rejects.toThrow(new ConflictException('robot_name_taken'));
    });

    it('rejects an unknown robot', async () => {
        const { service } = setup([]);

        await expect(service.update(TITA_ID, { name: 'Titã' })).rejects.toThrow(
            new NotFoundException('robot_not_found'),
        );
    });
});

describe('RobotsService.remove', () => {
    it('soft-deletes a robot without matches', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);

        await service.remove(TITA_ID);

        expect(robotsRepository.hasMatches).toHaveBeenCalledWith(TITA_ID);
        expect(robotsRepository.remove).toHaveBeenCalledWith(TITA_ID);
    });

    it('keeps a robot that is in a match', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')], {
            hasMatches: true,
        });

        await expect(service.remove(TITA_ID)).rejects.toThrow(
            new ConflictException('robot_has_matches'),
        );
        expect(robotsRepository.remove).not.toHaveBeenCalled();
    });

    it('rejects an unknown robot', async () => {
        const { service } = setup([]);

        await expect(service.remove(TITA_ID)).rejects.toThrow(
            new NotFoundException('robot_not_found'),
        );
    });
});

describe('RobotsService.update while in a match', () => {
    it('rejects a weight class change', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')], {
            hasMatches: true,
        });

        await expect(
            service.update(TITA_ID, { weightClass: 'heavyweight' }),
        ).rejects.toThrow(new ConflictException('robot_has_matches'));
        expect(robotsRepository.update).not.toHaveBeenCalled();
    });

    it('allows other changes and the same weight class', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')], {
            hasMatches: true,
        });
        const dto = {
            name: 'Titã II',
            team: 'Equipe Nova',
            weightClass: 'lightweight' as const,
        };

        await service.update(TITA_ID, dto);

        expect(robotsRepository.hasMatches).not.toHaveBeenCalled();
        expect(robotsRepository.update).toHaveBeenCalledWith(TITA_ID, dto);
    });

    it('allows a weight class change when the robot has no matches', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);

        await service.update(TITA_ID, { weightClass: 'heavyweight' });

        expect(robotsRepository.update).toHaveBeenCalledWith(TITA_ID, {
            weightClass: 'heavyweight',
        });
    });
});
