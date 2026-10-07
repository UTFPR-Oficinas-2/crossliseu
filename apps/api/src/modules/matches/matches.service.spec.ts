import 'reflect-metadata';
import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { MatchesService } from './matches.service.js';
import { Match } from './entities/match.entity.js';
import type { MatchState } from './entities/match.entity.js';
import { Robot } from '../robots/entities/robot.entity.js';
import type { MatchesRepository } from './matches.repository.js';
import type { ChampionshipsService } from '../championships/championships.service.js';
import type { RobotsService } from '../robots/robots.service.js';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CHAMPIONSHIP_ID = '22222222-2222-4222-8222-222222222222';
const ROBOT_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ROBOT_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROBOT_C_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MATCH_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function robot(
    id: string,
    { championshipId = CHAMPIONSHIP_ID, weightClass = 'lightweight' } = {},
): Robot {
    const entity = new Robot(
        `robot-${id}`,
        weightClass,
        'team',
        championshipId,
    );
    entity.id = id;
    return entity;
}

function match(status: MatchState = 'waiting'): Match {
    const entity = new Match(
        'lightweight',
        CHAMPIONSHIP_ID,
        ROBOT_A_ID,
        ROBOT_B_ID,
    );
    entity.id = MATCH_ID;
    entity.status = status;
    return entity;
}

function setup(robots: Robot[], matches: Match[] = []) {
    const matchesRepository = {
        create: vi.fn((entity: Match) => Promise.resolve(entity)),
        findAll: vi.fn().mockResolvedValue(matches),
        findOne: vi.fn((id: string) =>
            Promise.resolve(matches.find((entity) => entity.id === id) ?? null),
        ),
        // Applies the change so the service's reload sees it
        update: vi.fn((id: string, partial: Partial<Match>) => {
            Object.assign(
                matches.find((entity) => entity.id === id) ?? {},
                partial,
            );
            return Promise.resolve();
        }),
        remove: vi.fn().mockResolvedValue(undefined),
    };
    const championshipsService = {
        findOne: vi.fn().mockResolvedValue({ id: CHAMPIONSHIP_ID }),
    };
    const robotsService = {
        findOne: vi.fn((id: string) => {
            const found = robots.find((entity) => entity.id === id);
            return found
                ? Promise.resolve(found)
                : Promise.reject(new NotFoundException('robot_not_found'));
        }),
    };
    const service = new MatchesService(
        matchesRepository as unknown as MatchesRepository,
        championshipsService as unknown as ChampionshipsService,
        robotsService as unknown as RobotsService,
    );

    return { service, matchesRepository, championshipsService };
}

const dto = {
    championshipId: CHAMPIONSHIP_ID,
    robotAId: ROBOT_A_ID,
    robotBId: ROBOT_B_ID,
};

describe('MatchesService.create', () => {
    it('saves a waiting match with the championship and both robots', async () => {
        const { service, matchesRepository, championshipsService } = setup([
            robot(ROBOT_A_ID),
            robot(ROBOT_B_ID),
        ]);

        const created = await service.create(dto);

        expect(championshipsService.findOne).toHaveBeenCalledWith(
            CHAMPIONSHIP_ID,
        );
        expect(matchesRepository.create).toHaveBeenCalledOnce();
        expect(created).toMatchObject({
            weightClass: 'lightweight',
            championshipId: CHAMPIONSHIP_ID,
            robotAId: ROBOT_A_ID,
            robotBId: ROBOT_B_ID,
            status: 'waiting',
        });
    });

    it('stores the weight class shared by the robots', async () => {
        const { service } = setup([
            robot(ROBOT_A_ID, { weightClass: 'heavyweight' }),
            robot(ROBOT_B_ID, { weightClass: 'heavyweight' }),
        ]);

        const created = await service.create(dto);

        expect(created.weightClass).toBe('heavyweight');
    });

    it('rejects robots of different weight classes', async () => {
        const { service, matchesRepository } = setup([
            robot(ROBOT_A_ID, { weightClass: 'lightweight' }),
            robot(ROBOT_B_ID, { weightClass: 'heavyweight' }),
        ]);

        await expect(service.create(dto)).rejects.toThrow(
            new BadRequestException('match_weight_class_mismatch'),
        );
        expect(matchesRepository.create).not.toHaveBeenCalled();
    });

    it('rejects the same robot on both sides', async () => {
        const { service, matchesRepository } = setup([robot(ROBOT_A_ID)]);

        await expect(
            service.create({ ...dto, robotBId: ROBOT_A_ID }),
        ).rejects.toThrow(new BadRequestException('match_robots_must_differ'));
        expect(matchesRepository.create).not.toHaveBeenCalled();
    });

    it('rejects a robot registered in another championship', async () => {
        const { service, matchesRepository } = setup([
            robot(ROBOT_A_ID),
            robot(ROBOT_B_ID, { championshipId: OTHER_CHAMPIONSHIP_ID }),
        ]);

        await expect(service.create(dto)).rejects.toThrow(
            new BadRequestException('robot_not_in_championship'),
        );
        expect(matchesRepository.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown robot', async () => {
        const { service, matchesRepository } = setup([robot(ROBOT_A_ID)]);

        await expect(service.create(dto)).rejects.toThrow(
            new NotFoundException('robot_not_found'),
        );
        expect(matchesRepository.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown championship', async () => {
        const { service, matchesRepository, championshipsService } = setup([
            robot(ROBOT_A_ID),
            robot(ROBOT_B_ID),
        ]);
        championshipsService.findOne.mockRejectedValue(
            new NotFoundException('championship_not_found'),
        );

        await expect(service.create(dto)).rejects.toThrow(
            new NotFoundException('championship_not_found'),
        );
        expect(matchesRepository.create).not.toHaveBeenCalled();
    });
});

describe('MatchesService.findAll', () => {
    it('passes the championship filter to the repository', async () => {
        const { service, matchesRepository } = setup([]);

        await service.findAll(CHAMPIONSHIP_ID);

        expect(matchesRepository.findAll).toHaveBeenCalledWith(CHAMPIONSHIP_ID);
    });
});

describe('MatchesService.update', () => {
    it('swaps a robot and re-derives the weight class', async () => {
        const { service, matchesRepository } = setup(
            [robot(ROBOT_A_ID), robot(ROBOT_B_ID), robot(ROBOT_C_ID)],
            [match()],
        );

        const updated = await service.update(MATCH_ID, {
            robotBId: ROBOT_C_ID,
        });

        expect(matchesRepository.update).toHaveBeenCalledWith(MATCH_ID, {
            robotAId: ROBOT_A_ID,
            robotBId: ROBOT_C_ID,
            weightClass: 'lightweight',
        });
        expect(updated).toMatchObject({
            robotAId: ROBOT_A_ID,
            robotBId: ROBOT_C_ID,
        });
    });

    it('checks the merged pair against the match championship', async () => {
        const { service, matchesRepository } = setup(
            [
                robot(ROBOT_A_ID),
                robot(ROBOT_B_ID),
                robot(ROBOT_C_ID, { championshipId: OTHER_CHAMPIONSHIP_ID }),
            ],
            [match()],
        );

        await expect(
            service.update(MATCH_ID, { robotBId: ROBOT_C_ID }),
        ).rejects.toThrow(new BadRequestException('robot_not_in_championship'));
        expect(matchesRepository.update).not.toHaveBeenCalled();
    });

    it('rejects a robot of another weight class', async () => {
        const { service, matchesRepository } = setup(
            [
                robot(ROBOT_A_ID),
                robot(ROBOT_B_ID),
                robot(ROBOT_C_ID, { weightClass: 'heavyweight' }),
            ],
            [match()],
        );

        await expect(
            service.update(MATCH_ID, { robotBId: ROBOT_C_ID }),
        ).rejects.toThrow(
            new BadRequestException('match_weight_class_mismatch'),
        );
        expect(matchesRepository.update).not.toHaveBeenCalled();
    });

    it('rejects the robot already on the other side', async () => {
        const { service } = setup(
            [robot(ROBOT_A_ID), robot(ROBOT_B_ID)],
            [match()],
        );

        await expect(
            service.update(MATCH_ID, { robotBId: ROBOT_A_ID }),
        ).rejects.toThrow(new BadRequestException('match_robots_must_differ'));
    });

    it.each(['running', 'paused', 'finished'] as const)(
        'rejects editing a %s match',
        async (status) => {
            const { service, matchesRepository } = setup(
                [robot(ROBOT_A_ID), robot(ROBOT_B_ID), robot(ROBOT_C_ID)],
                [match(status)],
            );

            await expect(
                service.update(MATCH_ID, { robotBId: ROBOT_C_ID }),
            ).rejects.toThrow(new ConflictException('match_not_editable'));
            expect(matchesRepository.update).not.toHaveBeenCalled();
        },
    );

    it('rejects an unknown match', async () => {
        const { service } = setup([robot(ROBOT_A_ID), robot(ROBOT_B_ID)]);

        await expect(
            service.update(MATCH_ID, { robotBId: ROBOT_B_ID }),
        ).rejects.toThrow(new NotFoundException('match_not_found'));
    });
});

describe('MatchesService.remove', () => {
    it('soft-deletes a waiting match', async () => {
        const { service, matchesRepository } = setup([], [match()]);

        await service.remove(MATCH_ID);

        expect(matchesRepository.remove).toHaveBeenCalledWith(MATCH_ID);
    });

    it.each(['running', 'paused', 'finished'] as const)(
        'keeps a %s match',
        async (status) => {
            const { service, matchesRepository } = setup([], [match(status)]);

            await expect(service.remove(MATCH_ID)).rejects.toThrow(
                new ConflictException('match_not_editable'),
            );
            expect(matchesRepository.remove).not.toHaveBeenCalled();
        },
    );

    it('rejects an unknown match', async () => {
        const { service } = setup([]);

        await expect(service.remove(MATCH_ID)).rejects.toThrow(
            new NotFoundException('match_not_found'),
        );
    });
});
