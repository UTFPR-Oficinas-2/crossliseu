import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { MatchesRepository } from './matches.repository.js';
import { Match } from './entities/match.entity.js';
import { CreateMatchDto } from './dto/create-match.dto.js';
import { UpdateMatchDto } from './dto/update-match.dto.js';
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

    async update(id: string, updateMatchDto: UpdateMatchDto) {
        const match = await this.findOne(id);
        this.assertEditable(match);

        const robotAId = updateMatchDto.robotAId ?? match.robotAId;
        const robotBId = updateMatchDto.robotBId ?? match.robotBId;
        const weightClass = await this.resolveRobots(
            match.championshipId,
            robotAId,
            robotBId,
        );

        await this.matchesRepository.update(id, {
            robotAId,
            robotBId,
            weightClass,
        });

        return this.findOne(id);
    }

    async remove(id: string) {
        const match = await this.findOne(id);
        this.assertEditable(match);
        await this.matchesRepository.remove(id);
    }

    /** Only scheduled (`waiting`) matches can be edited or deleted */
    private assertEditable(match: Match) {
        if (match.status !== 'waiting') {
            this.logger.error('match_not_editable', {
                id: match.id,
                status: match.status,
            });
            throw new ConflictException('match_not_editable');
        }
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
