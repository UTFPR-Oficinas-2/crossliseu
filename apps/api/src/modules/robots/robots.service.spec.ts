import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { RobotsService } from './robots.service.js';
import { Robot } from './entities/robot.entity.js';
import type {
    RobotsRepository,
    RobotWriteResult,
} from './robots.repository.js';
import type { ChampionshipsService } from '../championships/championships.service.js';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CHAMPIONSHIP_ID = '22222222-2222-4222-8222-222222222222';
const TITA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MARTE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

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
        USER_ID,
    );
    entity.id = id;
    return entity;
}

function setup(
    robots: Robot[],
    { hasMatches = false }: { hasMatches?: boolean } = {},
) {
    const robotsRepository = {
        create: vi.fn((entity: Robot): Promise<Robot | null> =>
            Promise.resolve(entity),
        ),
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
        // Checks for matches in the same locked transaction as the write
        update: vi.fn(
            (
                _id: string,
                _patch: Partial<Robot>,
                opts: { requireNoMatches: boolean },
            ): Promise<RobotWriteResult> =>
                Promise.resolve(
                    opts.requireNoMatches && hasMatches
                        ? 'has_matches'
                        : 'done',
                ),
        ),
        remove: vi.fn((): Promise<RobotWriteResult> =>
            Promise.resolve(hasMatches ? 'has_matches' : 'done'),
        ),
    };
    const championshipsService = {
        findOwned: vi.fn().mockResolvedValue({ id: CHAMPIONSHIP_ID }),
        isOwnedBy: vi.fn().mockResolvedValue(true),
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

        const created = await service.create(createDto, USER_ID);

        expect(championshipsService.findOwned).toHaveBeenCalledWith(
            CHAMPIONSHIP_ID,
            USER_ID,
        );
        expect(robotsRepository.create).toHaveBeenCalledOnce();
        expect(created).toMatchObject({
            ...createDto,
            createdByUserId: USER_ID,
        });
    });

    it('rejects a name already used in the championship, ignoring case', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);

        await expect(
            service.create({ ...createDto, name: 'TITÃ' }, USER_ID),
        ).rejects.toThrow(new ConflictException('robot_name_taken'));
        expect(robotsRepository.create).not.toHaveBeenCalled();
    });

    it('allows a name used in another championship', async () => {
        const { service, robotsRepository } = setup([
            robot(TITA_ID, 'Titã', OTHER_CHAMPIONSHIP_ID),
        ]);

        await service.create(createDto, USER_ID);

        expect(robotsRepository.create).toHaveBeenCalledOnce();
    });

    it('reports a save that lost a race on the unique index as robot_name_taken', async () => {
        const { service, robotsRepository } = setup([]);
        robotsRepository.create.mockRejectedValue(uniqueViolation());

        await expect(service.create(createDto, USER_ID)).rejects.toThrow(
            new ConflictException('robot_name_taken'),
        );
    });

    it('rejects an unknown or unowned championship', async () => {
        const { service, robotsRepository, championshipsService } = setup([]);
        championshipsService.findOwned.mockRejectedValue(
            new NotFoundException('championship_not_found'),
        );

        await expect(service.create(createDto, USER_ID)).rejects.toThrow(
            new NotFoundException('championship_not_found'),
        );
        expect(robotsRepository.create).not.toHaveBeenCalled();
    });
});

describe('RobotsService.update', () => {
    it('lets a robot keep its own name with different case', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);

        await service.update(TITA_ID, { name: 'TITÃ' }, USER_ID);

        expect(robotsRepository.update).toHaveBeenCalledWith(
            TITA_ID,
            { name: 'TITÃ' },
            { requireNoMatches: false },
        );
    });

    it('rejects the name of another robot in the championship', async () => {
        const { service, robotsRepository } = setup([
            robot(TITA_ID, 'Titã'),
            robot(MARTE_ID, 'Marte'),
        ]);

        await expect(
            service.update(MARTE_ID, { name: 'titã' }, USER_ID),
        ).rejects.toThrow(new ConflictException('robot_name_taken'));
        expect(robotsRepository.update).not.toHaveBeenCalled();
    });

    it('skips the name check when the name is not changing', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);

        await service.update(TITA_ID, { team: 'Equipe Nova' }, USER_ID);

        expect(robotsRepository.findByName).not.toHaveBeenCalled();
        expect(robotsRepository.update).toHaveBeenCalledWith(
            TITA_ID,
            { team: 'Equipe Nova' },
            { requireNoMatches: false },
        );
    });

    it('maps a unique index race on update to robot_name_taken', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);
        robotsRepository.update.mockRejectedValue(uniqueViolation());

        await expect(
            service.update(TITA_ID, { name: 'Marte' }, USER_ID),
        ).rejects.toThrow(new ConflictException('robot_name_taken'));
    });

    it('rejects an unknown robot', async () => {
        const { service } = setup([]);

        await expect(
            service.update(TITA_ID, { name: 'Titã' }, USER_ID),
        ).rejects.toThrow(new NotFoundException('robot_not_found'));
    });
});

describe('RobotsService.remove', () => {
    it('soft-deletes a robot without matches', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);

        await service.remove(TITA_ID, USER_ID);

        expect(robotsRepository.remove).toHaveBeenCalledWith(TITA_ID);
    });

    it('keeps a robot that is in a match', async () => {
        const { service } = setup([robot(TITA_ID, 'Titã')], {
            hasMatches: true,
        });

        await expect(service.remove(TITA_ID, USER_ID)).rejects.toThrow(
            new ConflictException('robot_has_matches'),
        );
    });

    it('rejects an unknown robot', async () => {
        const { service } = setup([]);

        await expect(service.remove(TITA_ID, USER_ID)).rejects.toThrow(
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
            service.update(TITA_ID, { weightClass: 'featherweight' }, USER_ID),
        ).rejects.toThrow(new ConflictException('robot_has_matches'));
        expect(robotsRepository.update).toHaveBeenCalledWith(
            TITA_ID,
            { weightClass: 'featherweight' },
            { requireNoMatches: true },
        );
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

        await service.update(TITA_ID, dto, USER_ID);

        expect(robotsRepository.update).toHaveBeenCalledWith(TITA_ID, dto, {
            requireNoMatches: false,
        });
    });

    it('allows a weight class change when the robot has no matches', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);

        await service.update(
            TITA_ID,
            { weightClass: 'featherweight' },
            USER_ID,
        );

        expect(robotsRepository.update).toHaveBeenCalledWith(
            TITA_ID,
            { weightClass: 'featherweight' },
            { requireNoMatches: true },
        );
    });
});

describe('RobotsService logging', () => {
    it('logs an unknown robot at warn, not error', async () => {
        const { service } = setup([]);
        const warn = vi
            .spyOn(service.logger, 'warn')
            .mockImplementation(() => {});
        const error = vi
            .spyOn(service.logger, 'error')
            .mockImplementation(() => {});

        await expect(service.findOne(TITA_ID)).rejects.toThrow(
            new NotFoundException('robot_not_found'),
        );
        expect(warn).toHaveBeenCalledWith('robot_not_found', { id: TITA_ID });
        expect(error).not.toHaveBeenCalled();
    });
});

describe('RobotsService writes that lose a race', () => {
    it('reports an update of a robot deleted after it was read as not found', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);
        robotsRepository.update.mockResolvedValueOnce('not_found');

        await expect(
            service.update(TITA_ID, { team: 'Equipe Nova' }, USER_ID),
        ).rejects.toThrow(new NotFoundException('robot_not_found'));
    });

    it('reports a weight change that met a new match in the lock as robot_has_matches', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);
        robotsRepository.update.mockResolvedValueOnce('has_matches');

        await expect(
            service.update(TITA_ID, { weightClass: 'featherweight' }, USER_ID),
        ).rejects.toThrow(new ConflictException('robot_has_matches'));
    });

    it('reports a delete of a robot deleted after it was read as not found', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);
        robotsRepository.remove.mockResolvedValueOnce('not_found');

        await expect(service.remove(TITA_ID, USER_ID)).rejects.toThrow(
            new NotFoundException('robot_not_found'),
        );
    });
});

describe('RobotsService.create while the championship is deleted', () => {
    it('reports a championship deleted before the insert took its lock', async () => {
        const { service, robotsRepository } = setup([]);
        robotsRepository.create.mockResolvedValueOnce(null);

        await expect(service.create(createDto, USER_ID)).rejects.toThrow(
            new NotFoundException('championship_not_found'),
        );
    });
});

describe('RobotsService writes by a non-owner', () => {
    const OTHER_USER_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

    it('hides the robot on update, before the name check and the write', async () => {
        const { service, robotsRepository, championshipsService } = setup([
            robot(TITA_ID, 'Titã'),
        ]);
        championshipsService.isOwnedBy.mockResolvedValue(false);

        await expect(
            service.update(TITA_ID, { name: 'Marte' }, OTHER_USER_ID),
        ).rejects.toThrow(new NotFoundException('robot_not_found'));
        expect(championshipsService.isOwnedBy).toHaveBeenCalledWith(
            CHAMPIONSHIP_ID,
            OTHER_USER_ID,
        );
        expect(robotsRepository.findByName).not.toHaveBeenCalled();
        expect(robotsRepository.update).not.toHaveBeenCalled();
    });

    it('hides the robot on remove, even when it is in a match', async () => {
        const { service, robotsRepository, championshipsService } = setup(
            [robot(TITA_ID, 'Titã')],
            { hasMatches: true },
        );
        championshipsService.isOwnedBy.mockResolvedValue(false);

        await expect(service.remove(TITA_ID, OTHER_USER_ID)).rejects.toThrow(
            new NotFoundException('robot_not_found'),
        );
        expect(robotsRepository.remove).not.toHaveBeenCalled();
    });

    it('hides a weight class change that would have answered has_matches', async () => {
        const { service, robotsRepository, championshipsService } = setup(
            [robot(TITA_ID, 'Titã')],
            { hasMatches: true },
        );
        championshipsService.isOwnedBy.mockResolvedValue(false);

        await expect(
            service.update(
                TITA_ID,
                { weightClass: 'featherweight' },
                OTHER_USER_ID,
            ),
        ).rejects.toThrow(new NotFoundException('robot_not_found'));
        expect(robotsRepository.update).not.toHaveBeenCalled();
    });

    it('logs the hidden robot at warn', async () => {
        const { service, championshipsService } = setup([
            robot(TITA_ID, 'Titã'),
        ]);
        championshipsService.isOwnedBy.mockResolvedValue(false);
        const warn = vi
            .spyOn(service.logger, 'warn')
            .mockImplementation(() => {});

        await expect(service.remove(TITA_ID, OTHER_USER_ID)).rejects.toThrow(
            NotFoundException,
        );
        expect(warn).toHaveBeenCalledWith('robot_not_found', { id: TITA_ID });
    });
});
