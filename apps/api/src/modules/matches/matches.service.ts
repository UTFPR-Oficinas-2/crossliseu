import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { MatchesRepository } from './matches.repository.js';
import { Match } from './entities/match.entity.js';
import { CreateMatchDto } from './dto/create-match.dto.js';
import { ChampionshipsService } from '../championships/championships.service.js';
import { RobotsService } from '../robots/robots.service.js';

@Injectable()
export class MatchesService {
    logger: Logger = new Logger(MatchesService.name);

    constructor(
        private readonly matchesRepository: MatchesRepository,
        private readonly championshipsService: ChampionshipsService,
        private readonly robotsService: RobotsService,
    ) {}

    async create(createMatchDto: CreateMatchDto) {
        const { championshipId, robotAId, robotBId } = createMatchDto;

        // Throws championship_not_found when it does not exist
        await this.championshipsService.findOne(championshipId);

        const weightClass = await this.resolveRobots(
            championshipId,
            robotAId,
            robotBId,
        );

        const match: Match = new Match(
            weightClass,
            championshipId,
            robotAId,
            robotBId,
        );

        return this.matchesRepository.create(match);
    }

    findAll(championshipId?: string) {
        return this.matchesRepository.findAll(championshipId);
    }

    async findOne(id: string) {
        const match = await this.matchesRepository.findOne(id);

        if (!match) {
            this.logger.error('match_not_found', { id: id });
            throw new NotFoundException('match_not_found');
        }

        return match;
    }

    /**
     * Checks that the robots differ, exist, belong to the championship and share a weight class
     * ("Dois robôs diferentes… da mesma categoria de peso", Figma 10b). Returns that class.
     */
    private async resolveRobots(
        championshipId: string,
        robotAId: string,
        robotBId: string,
    ): Promise<string> {
        if (robotAId === robotBId) {
            this.logger.error('match_robots_must_differ', { robotAId });
            throw new BadRequestException('match_robots_must_differ');
        }

        // Throws robot_not_found when either does not exist
        const [robotA, robotB] = await Promise.all([
            this.robotsService.findOne(robotAId),
            this.robotsService.findOne(robotBId),
        ]);

        for (const robot of [robotA, robotB]) {
            if (robot.championshipId !== championshipId) {
                this.logger.error('robot_not_in_championship', {
                    robotId: robot.id,
                    championshipId,
                });
                throw new BadRequestException('robot_not_in_championship');
            }
        }

        if (robotA.weightClass !== robotB.weightClass) {
            this.logger.error('match_weight_class_mismatch', {
                robotAId,
                robotBId,
            });
            throw new BadRequestException('match_weight_class_mismatch');
        }

        return robotA.weightClass;
    }
}
