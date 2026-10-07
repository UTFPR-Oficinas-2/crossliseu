import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MatchesService } from './matches.service.js';
import { Match } from './entities/match.entity.js';
import { Robot } from '../robots/entities/robot.entity.js';
import type { MatchesRepository } from './matches.repository.js';
import type { ChampionshipsService } from '../championships/championships.service.js';
import type { RobotsService } from '../robots/robots.service.js';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CHAMPIONSHIP_ID = '22222222-2222-4222-8222-222222222222';
const ROBOT_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ROBOT_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function robot(id: string, championshipId = CHAMPIONSHIP_ID): Robot {
    const entity = new Robot(
        `robot-${id}`,
        'beetleweight',
        'team',
        championshipId,
    );
    entity.id = id;
    return entity;
}

function setup(robots: Robot[]) {
    const matchesRepository = {
        create: vi.fn((match: Match) => Promise.resolve(match)),
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
    weightClass: 'beetleweight',
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

        const match = await service.create(dto);

        expect(championshipsService.findOne).toHaveBeenCalledWith(
            CHAMPIONSHIP_ID,
        );
        expect(matchesRepository.create).toHaveBeenCalledOnce();
        expect(match).toMatchObject({
            weightClass: 'beetleweight',
            championshipId: CHAMPIONSHIP_ID,
            robotAId: ROBOT_A_ID,
            robotBId: ROBOT_B_ID,
            status: 'waiting',
        });
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
            robot(ROBOT_B_ID, OTHER_CHAMPIONSHIP_ID),
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
