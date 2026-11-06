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
import { Robot } from '../robots/entities/robot.entity.js';
import type { WeightClass } from '../robots/weight-class.js';

@Injectable()
export class MatchesService {
    logger: Logger = new Logger(MatchesService.name);

    constructor(
        private readonly matchesRepository: MatchesRepository,
        private readonly championshipsService: ChampionshipsService,
    ) {}

    async create(createMatchDto: CreateMatchDto, createdByUserId: string) {
        const { championshipId, robotAId, robotBId, scheduledAt } =
            createMatchDto;

        // Throws championship_not_found when it does not exist
        await this.championshipsService.findOne(championshipId);

        this.assertRobotsDiffer(robotAId, robotBId);

        // The robots are checked as read under the lock, so they can't change before the insert
        const created = await this.matchesRepository.createWithRobots(
            championshipId,
            [robotAId, robotBId],
            (robotA, robotB) =>
                new Match(
                    this.pairRobots(championshipId, robotA, robotB),
                    championshipId,
                    robotAId,
                    robotBId,
                    createdByUserId,
                    scheduledAt,
                ),
        );
        if (!created) {
            // The championship was deleted after the check above
            this.logger.warn('championship_not_found', { id: championshipId });
            throw new NotFoundException('championship_not_found');
        }

        // Reloaded so the response has the robots, like GET /matches
        return this.findOne(created.id);
    }

    findAll(championshipId?: string) {
        return this.matchesRepository.findAll(championshipId);
    }

    async findOne(id: string) {
        const match = await this.matchesRepository.findOne(id);

        if (!match) {
            this.logger.warn('match_not_found', { id: id });
            throw new NotFoundException('match_not_found');
        }

        return match;
    }

    async update(id: string, updateMatchDto: UpdateMatchDto) {
        const match = await this.findOne(id);
        this.assertEditable(match);

        const robotAId = updateMatchDto.robotAId ?? match.robotAId;
        const robotBId = updateMatchDto.robotBId ?? match.robotBId;
        this.assertRobotsDiffer(robotAId, robotBId);

        const updated = await this.matchesRepository.updateScheduledWithRobots(
            id,
            match.championshipId,
            [robotAId, robotBId],
            (robotA, robotB) => ({
                robotAId,
                robotBId,
                weightClass: this.pairRobots(
                    match.championshipId,
                    robotA,
                    robotB,
                ),
                ...(updateMatchDto.scheduledAt && {
                    scheduledAt: updateMatchDto.scheduledAt,
                }),
            }),
        );
        if (!updated) {
            await this.rejectLostWrite(id);
        }

        return this.findOne(id);
    }

    async remove(id: string) {
        const match = await this.findOne(id);
        this.assertEditable(match);

        const removed = await this.matchesRepository.softDeleteIf(id, {
            state: 'scheduled',
        });
        if (!removed) {
            await this.rejectLostWrite(id);
        }
    }

    /**
     * A conditional write matched nothing: the match was deleted or left `scheduled` after it was
     * read. Re-reads it to report which.
     */
    private async rejectLostWrite(id: string): Promise<never> {
        // Throws match_not_found when it was deleted
        const match = await this.findOne(id);
        this.assertEditable(match);
        // Still scheduled, yet the write missed: report the conflict rather than pretend it saved
        this.logger.error('match_not_editable', { id, state: match.state });
        throw new ConflictException('match_not_editable');
    }

    /** Only matches that have not started (`scheduled`) can be edited or deleted */
    private assertEditable(match: Match) {
        if (match.state !== 'scheduled') {
            this.logger.error('match_not_editable', {
                id: match.id,
                state: match.state,
            });
            throw new ConflictException('match_not_editable');
        }
    }

    private assertRobotsDiffer(robotAId: string, robotBId: string) {
        if (robotAId === robotBId) {
            this.logger.error('match_robots_must_differ', { robotAId });
            throw new BadRequestException('match_robots_must_differ');
        }
    }

    /**
     * Checks that both robots exist and belong to the championship and share a weight class
     * ("Dois robôs diferentes… da mesma categoria de peso", Figma 10b). Returns that class.
     * The robots are the ones read under the write's lock (MatchesRepository).
     */
    private pairRobots(
        championshipId: string,
        robotA: Robot | null,
        robotB: Robot | null,
    ): WeightClass {
        if (!robotA || !robotB) {
            this.logger.warn('robot_not_found', {
                robotAId: robotA?.id,
                robotBId: robotB?.id,
            });
            throw new NotFoundException('robot_not_found');
        }

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
                robotAId: robotA.id,
                robotBId: robotB.id,
            });
            throw new BadRequestException('match_weight_class_mismatch');
        }

        return robotA.weightClass;
    }
}
