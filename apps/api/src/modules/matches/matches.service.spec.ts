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
import type { WeightClass } from '../robots/weight-class.js';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CHAMPIONSHIP_ID = '22222222-2222-4222-8222-222222222222';
const ROBOT_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ROBOT_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROBOT_C_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MATCH_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const USER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SCHEDULED_AT = new Date('2026-11-10T14:00:00Z');

function robot(
    id: string,
    {
        championshipId = CHAMPIONSHIP_ID,
        weightClass = 'lightweight',
    }: { championshipId?: string; weightClass?: WeightClass } = {},
): Robot {
    const entity = new Robot(
        `robot-${id}`,
        weightClass,
        'team',
        championshipId,
        USER_ID,
    );
    entity.id = id;
    return entity;
}

function match(state: MatchState = 'scheduled'): Match {
    const entity = new Match(
        'lightweight',
        CHAMPIONSHIP_ID,
        ROBOT_A_ID,
        ROBOT_B_ID,
        USER_ID,
        SCHEDULED_AT,
    );
    entity.id = MATCH_ID;
    entity.state = state;
    return entity;
}

function setup(robots: Robot[], matches: Match[] = []) {
    const byId = (id: string) =>
        robots.find((entity) => entity.id === id) ?? null;
    const matchesRepository = {
        // The insert and the conditional update inside the locked transactions below
        inserted: vi.fn((entity: Match) => {
            entity.id = entity.id ?? MATCH_ID;
            matches.push(entity);
        }),
        updated: vi.fn((id: string, partial: Partial<Match>) => {
            const found = matches.find(
                (entity) => entity.id === id && entity.state === 'scheduled',
            );
            Object.assign(found ?? {}, partial);
            return found !== undefined;
        }),
        // Hands `build` the robots as read under the lock (null when missing), then writes
        createWithRobots: vi.fn(
            async (
                _championshipId: string,
                [robotAId, robotBId]: [string, string],
                build: (
                    a: Robot | null,
                    b: Robot | null,
                ) => Promise<Match> | Match,
            ): Promise<Match | null> => {
                const entity = await build(byId(robotAId), byId(robotBId));
                matchesRepository.inserted(entity);
                return entity;
            },
        ),
        updateScheduledWithRobots: vi.fn(
            async (
                id: string,
                _championshipId: string,
                [robotAId, robotBId]: [string, string],
                build: (
                    a: Robot | null,
                    b: Robot | null,
                ) => Promise<Partial<Match>> | Partial<Match>,
            ): Promise<boolean> => {
                const partial = await build(byId(robotAId), byId(robotBId));
                return matchesRepository.updated(id, partial);
            },
        ),
        findAll: vi.fn().mockResolvedValue(matches),
        findOne: vi.fn((id: string) =>
            Promise.resolve(matches.find((entity) => entity.id === id) ?? null),
        ),
        softDeleteIf: vi.fn((id: string, expected: Partial<Match>) =>
            Promise.resolve(
                matches.some(
                    (entity) =>
                        entity.id === id && entity.state === expected.state,
                ),
            ),
        ),
    };
    const championshipsService = {
        findOne: vi.fn().mockResolvedValue({ id: CHAMPIONSHIP_ID }),
    };
    const service = new MatchesService(
        matchesRepository as unknown as MatchesRepository,
        championshipsService as unknown as ChampionshipsService,
    );

    return { service, matchesRepository, championshipsService };
}

const dto = {
    championshipId: CHAMPIONSHIP_ID,
    robotAId: ROBOT_A_ID,
    robotBId: ROBOT_B_ID,
    scheduledAt: SCHEDULED_AT,
};

describe('MatchesService.create', () => {
    it('saves a scheduled match by its creator with the championship and both robots', async () => {
        const { service, matchesRepository, championshipsService } = setup([
            robot(ROBOT_A_ID),
            robot(ROBOT_B_ID),
        ]);

        const created = await service.create(dto, USER_ID);

        expect(championshipsService.findOne).toHaveBeenCalledWith(
            CHAMPIONSHIP_ID,
        );
        expect(matchesRepository.inserted).toHaveBeenCalledOnce();
        expect(created).toMatchObject({
            weightClass: 'lightweight',
            championshipId: CHAMPIONSHIP_ID,
            robotAId: ROBOT_A_ID,
            robotBId: ROBOT_B_ID,
            state: 'scheduled',
            createdByUserId: USER_ID,
            scheduledAt: SCHEDULED_AT,
        });
    });

    it('stores the weight class shared by the robots', async () => {
        const { service } = setup([
            robot(ROBOT_A_ID, { weightClass: 'featherweight' }),
            robot(ROBOT_B_ID, { weightClass: 'featherweight' }),
        ]);

        const created = await service.create(dto, USER_ID);

        expect(created.weightClass).toBe('featherweight');
    });

    it('rejects robots of different weight classes', async () => {
        const { service, matchesRepository } = setup([
            robot(ROBOT_A_ID, { weightClass: 'lightweight' }),
            robot(ROBOT_B_ID, { weightClass: 'featherweight' }),
        ]);

        await expect(service.create(dto, USER_ID)).rejects.toThrow(
            new BadRequestException('match_weight_class_mismatch'),
        );
        expect(matchesRepository.inserted).not.toHaveBeenCalled();
    });

    it('rejects the same robot on both sides', async () => {
        const { service, matchesRepository } = setup([robot(ROBOT_A_ID)]);

        await expect(
            service.create({ ...dto, robotBId: ROBOT_A_ID }, USER_ID),
        ).rejects.toThrow(new BadRequestException('match_robots_must_differ'));
        expect(matchesRepository.inserted).not.toHaveBeenCalled();
    });

    it('rejects a robot registered in another championship', async () => {
        const { service, matchesRepository } = setup([
            robot(ROBOT_A_ID),
            robot(ROBOT_B_ID, { championshipId: OTHER_CHAMPIONSHIP_ID }),
        ]);

        await expect(service.create(dto, USER_ID)).rejects.toThrow(
            new BadRequestException('robot_not_in_championship'),
        );
        expect(matchesRepository.inserted).not.toHaveBeenCalled();
    });

    it('rejects an unknown robot', async () => {
        const { service, matchesRepository } = setup([robot(ROBOT_A_ID)]);

        await expect(service.create(dto, USER_ID)).rejects.toThrow(
            new NotFoundException('robot_not_found'),
        );
        expect(matchesRepository.inserted).not.toHaveBeenCalled();
    });

    it('rejects an unknown championship', async () => {
        const { service, matchesRepository, championshipsService } = setup([
            robot(ROBOT_A_ID),
            robot(ROBOT_B_ID),
        ]);
        championshipsService.findOne.mockRejectedValue(
            new NotFoundException('championship_not_found'),
        );

        await expect(service.create(dto, USER_ID)).rejects.toThrow(
            new NotFoundException('championship_not_found'),
        );
        expect(matchesRepository.inserted).not.toHaveBeenCalled();
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

        expect(matchesRepository.updated).toHaveBeenCalledWith(MATCH_ID, {
            robotAId: ROBOT_A_ID,
            robotBId: ROBOT_C_ID,
            weightClass: 'lightweight',
        });
        expect(updated).toMatchObject({
            robotAId: ROBOT_A_ID,
            robotBId: ROBOT_C_ID,
        });
    });

    it('reschedules a match', async () => {
        const { service, matchesRepository } = setup(
            [robot(ROBOT_A_ID), robot(ROBOT_B_ID)],
            [match()],
        );
        const scheduledAt = new Date('2026-11-11T09:30:00Z');

        const updated = await service.update(MATCH_ID, { scheduledAt });

        expect(matchesRepository.updated).toHaveBeenCalledWith(MATCH_ID, {
            robotAId: ROBOT_A_ID,
            robotBId: ROBOT_B_ID,
            weightClass: 'lightweight',
            scheduledAt,
        });
        expect(updated.scheduledAt).toEqual(scheduledAt);
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
        expect(matchesRepository.updated).not.toHaveBeenCalled();
    });

    it('rejects a robot of another weight class', async () => {
        const { service, matchesRepository } = setup(
            [
                robot(ROBOT_A_ID),
                robot(ROBOT_B_ID),
                robot(ROBOT_C_ID, { weightClass: 'featherweight' }),
            ],
            [match()],
        );

        await expect(
            service.update(MATCH_ID, { robotBId: ROBOT_C_ID }),
        ).rejects.toThrow(
            new BadRequestException('match_weight_class_mismatch'),
        );
        expect(matchesRepository.updated).not.toHaveBeenCalled();
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

    it.each(['ongoing', 'paused', 'finished'] as const)(
        'rejects editing a %s match',
        async (state) => {
            const { service, matchesRepository } = setup(
                [robot(ROBOT_A_ID), robot(ROBOT_B_ID), robot(ROBOT_C_ID)],
                [match(state)],
            );

            await expect(
                service.update(MATCH_ID, { robotBId: ROBOT_C_ID }),
            ).rejects.toThrow(new ConflictException('match_not_editable'));
            expect(matchesRepository.updated).not.toHaveBeenCalled();
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
    it('soft-deletes a scheduled match', async () => {
        const { service, matchesRepository } = setup([], [match()]);

        await service.remove(MATCH_ID);

        expect(matchesRepository.softDeleteIf).toHaveBeenCalledWith(MATCH_ID, {
            state: 'scheduled',
        });
    });

    it.each(['ongoing', 'paused', 'finished'] as const)(
        'keeps a %s match',
        async (state) => {
            const { service, matchesRepository } = setup([], [match(state)]);

            await expect(service.remove(MATCH_ID)).rejects.toThrow(
                new ConflictException('match_not_editable'),
            );
            expect(matchesRepository.softDeleteIf).not.toHaveBeenCalled();
        },
    );

    it('rejects an unknown match', async () => {
        const { service } = setup([]);

        await expect(service.remove(MATCH_ID)).rejects.toThrow(
            new NotFoundException('match_not_found'),
        );
    });
});

describe('MatchesService logging', () => {
    it('logs an unknown match at warn, not error', async () => {
        const { service } = setup([]);
        const warn = vi
            .spyOn(service.logger, 'warn')
            .mockImplementation(() => {});
        const error = vi
            .spyOn(service.logger, 'error')
            .mockImplementation(() => {});

        await expect(service.findOne(MATCH_ID)).rejects.toThrow(
            new NotFoundException('match_not_found'),
        );
        expect(warn).toHaveBeenCalledWith('match_not_found', { id: MATCH_ID });
        expect(error).not.toHaveBeenCalled();
    });
});

describe('MatchesService writes that lose a race', () => {
    // The match was read as scheduled, then something else changed it before the write
    function startedBetweenReadAndWrite(
        matchesRepository: ReturnType<typeof setup>['matchesRepository'],
        after: Match | null,
    ) {
        matchesRepository.updateScheduledWithRobots.mockResolvedValueOnce(
            false,
        );
        matchesRepository.softDeleteIf.mockResolvedValueOnce(false);
        const read = match();
        matchesRepository.findOne
            .mockResolvedValueOnce(read)
            .mockResolvedValueOnce(after);
    }

    it('rejects an update when the match left scheduled before the write', async () => {
        const { service, matchesRepository } = setup([
            robot(ROBOT_A_ID),
            robot(ROBOT_B_ID),
            robot(ROBOT_C_ID),
        ]);
        startedBetweenReadAndWrite(matchesRepository, match('ongoing'));

        await expect(
            service.update(MATCH_ID, { robotBId: ROBOT_C_ID }),
        ).rejects.toThrow(new ConflictException('match_not_editable'));
        expect(
            matchesRepository.updateScheduledWithRobots,
        ).toHaveBeenCalledOnce();
    });

    it('reports an update of a match deleted before the write as not found', async () => {
        const { service, matchesRepository } = setup([
            robot(ROBOT_A_ID),
            robot(ROBOT_B_ID),
            robot(ROBOT_C_ID),
        ]);
        startedBetweenReadAndWrite(matchesRepository, null);

        await expect(
            service.update(MATCH_ID, { robotBId: ROBOT_C_ID }),
        ).rejects.toThrow(new NotFoundException('match_not_found'));
    });

    it('rejects a delete when the match left scheduled before the write', async () => {
        const { service, matchesRepository } = setup([]);
        startedBetweenReadAndWrite(matchesRepository, match('ongoing'));

        await expect(service.remove(MATCH_ID)).rejects.toThrow(
            new ConflictException('match_not_editable'),
        );
    });

    it('reports a delete of a match deleted before the write as not found', async () => {
        const { service, matchesRepository } = setup([]);
        startedBetweenReadAndWrite(matchesRepository, null);

        await expect(service.remove(MATCH_ID)).rejects.toThrow(
            new NotFoundException('match_not_found'),
        );
    });
});

describe('MatchesService response shape', () => {
    it('returns the created match reloaded, with its robots', async () => {
        const { service, matchesRepository } = setup([
            robot(ROBOT_A_ID),
            robot(ROBOT_B_ID),
        ]);
        const reloaded = match();
        reloaded.robotA = robot(ROBOT_A_ID);
        reloaded.robotB = robot(ROBOT_B_ID);
        matchesRepository.findOne.mockResolvedValueOnce(reloaded);

        const created = await service.create(dto, USER_ID);

        expect(matchesRepository.findOne).toHaveBeenCalledWith(MATCH_ID);
        expect(created.robotA?.name).toBe(`robot-${ROBOT_A_ID}`);
        expect(created.robotB?.name).toBe(`robot-${ROBOT_B_ID}`);
    });
});

describe('MatchesService robots read under the lock', () => {
    it('rejects a robot deleted before the lock was taken', async () => {
        const { service, matchesRepository } = setup([robot(ROBOT_A_ID)]);

        await expect(service.create(dto, USER_ID)).rejects.toThrow(
            new NotFoundException('robot_not_found'),
        );
        expect(matchesRepository.inserted).not.toHaveBeenCalled();
    });

    it('locks both robots of the merged pair on update', async () => {
        const { service, matchesRepository } = setup(
            [robot(ROBOT_A_ID), robot(ROBOT_B_ID), robot(ROBOT_C_ID)],
            [match()],
        );

        await service.update(MATCH_ID, { robotBId: ROBOT_C_ID });

        expect(
            matchesRepository.updateScheduledWithRobots,
        ).toHaveBeenCalledWith(
            MATCH_ID,
            CHAMPIONSHIP_ID,
            [ROBOT_A_ID, ROBOT_C_ID],
            expect.any(Function),
        );
    });

    it('reports a championship deleted before the lock was taken', async () => {
        const { service, matchesRepository } = setup([
            robot(ROBOT_A_ID),
            robot(ROBOT_B_ID),
        ]);
        matchesRepository.createWithRobots.mockResolvedValueOnce(null);

        await expect(service.create(dto, USER_ID)).rejects.toThrow(
            new NotFoundException('championship_not_found'),
        );
    });
});
