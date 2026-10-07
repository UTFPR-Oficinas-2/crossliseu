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
        const { weightClass, championshipId, robotAId, robotBId } =
            createMatchDto;

        if (robotAId === robotBId) {
            this.logger.error('match_robots_must_differ', { robotAId });
            throw new BadRequestException('match_robots_must_differ');
        }

        // Throws championship_not_found when it does not exist
        await this.championshipsService.findOne(championshipId);

        // Throws robot_not_found when either does not exist
        const robots = await Promise.all([
            this.robotsService.findOne(robotAId),
            this.robotsService.findOne(robotBId),
        ]);

        for (const robot of robots) {
            if (robot.championshipId !== championshipId) {
                this.logger.error('robot_not_in_championship', {
                    robotId: robot.id,
                    championshipId,
                });
                throw new BadRequestException('robot_not_in_championship');
            }
        }

        const match: Match = new Match(
            weightClass,
            championshipId,
            robotAId,
            robotBId,
        );

        return this.matchesRepository.create(match);
    }

    findAll() {
        return this.matchesRepository.findAll();
    }

    async findOne(id: string) {
        const match = await this.matchesRepository.findOne(id);

        if (!match) {
            this.logger.error('match_not_found', { id: id });
            throw new NotFoundException('match_not_found');
        }

        return match;
    }
}
