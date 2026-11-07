import {
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { RobotsRepository, RobotWriteResult } from './robots.repository.js';
import { Robot } from './entities/robot.entity.js';
import { CreateRobotDto } from './dto/create-robot.dto.js';
import { UpdateRobotDto } from './dto/update-robot.dto.js';
import { ChampionshipsService } from '../championships/championships.service.js';

/** Postgres unique_violation: two saves raced past assertNameAvailable and hit the name index */
function isUniqueViolation(error: unknown): boolean {
    return (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: unknown }).code === '23505'
    );
}

@Injectable()
export class RobotsService {
    logger: Logger = new Logger(RobotsService.name);

    constructor(
        private readonly robotsRepository: RobotsRepository,
        private readonly championshipsService: ChampionshipsService,
    ) {}

    async create(createRobotDto: CreateRobotDto, createdByUserId: string) {
        const { name, weightClass, team, championshipId } = createRobotDto;

        // Throws championship_not_found when it does not exist or is not the caller's
        await this.championshipsService.findOwned(
            championshipId,
            createdByUserId,
        );
        await this.assertNameAvailable(championshipId, name);

        const robot: Robot = new Robot(
            name,
            weightClass,
            team,
            championshipId,
            createdByUserId,
        );

        const created = await this.rethrowNameTaken(() =>
            this.robotsRepository.create(robot),
        );
        if (!created) {
            // The championship was deleted after the check above
            this.logger.warn('championship_not_found', { id: championshipId });
            throw new NotFoundException('championship_not_found');
        }
        return created;
    }

    findAll(championshipId?: string) {
        return this.robotsRepository.findAll(championshipId);
    }

    async findOne(id: string) {
        const robot = await this.robotsRepository.findOne(id);

        if (!robot) {
            this.logger.warn('robot_not_found', { id: id });
            throw new NotFoundException('robot_not_found');
        }

        return robot;
    }

    async update(id: string, updateRobotDto: UpdateRobotDto, userId: string) {
        const robot = await this.findOwnedRobot(id, userId);

        if (updateRobotDto.name !== undefined) {
            await this.assertNameAvailable(
                robot.championshipId,
                updateRobotDto.name,
                id,
            );
        }

        // A match pairs robots of one weight class (MatchesService.pairRobots)
        const requireNoMatches =
            updateRobotDto.weightClass !== undefined &&
            updateRobotDto.weightClass !== robot.weightClass;

        const result = await this.rethrowNameTaken(() =>
            this.robotsRepository.update(id, updateRobotDto, {
                requireNoMatches,
            }),
        );
        this.assertWritten(id, result);

        return this.findOne(id);
    }

    async remove(id: string, userId: string) {
        await this.findOwnedRobot(id, userId);
        // Matches keep pointing at their robots; a soft-deleted robot would orphan them
        this.assertWritten(id, await this.robotsRepository.remove(id));
    }

    /** A robot in someone else's championship answers exactly like an unknown one */
    private async findOwnedRobot(id: string, userId: string) {
        const robot = await this.findOne(id);

        if (
            !(await this.championshipsService.isOwnedBy(
                robot.championshipId,
                userId,
            ))
        ) {
            this.logger.warn('robot_not_found', { id });
            throw new NotFoundException('robot_not_found');
        }

        return robot;
    }

    /** "O nome do robô não pode se repetir dentro do mesmo campeonato" (Figma 09b), ignoring case */
    private async assertNameAvailable(
        championshipId: string,
        name: string,
        robotId?: string,
    ) {
        const existing = await this.robotsRepository.findByName(
            championshipId,
            name,
        );

        if (existing && existing.id !== robotId) {
            this.logger.error('robot_name_taken', { championshipId, name });
            throw new ConflictException('robot_name_taken');
        }
    }

    /** Maps a locked write's refusal to its error; the robot may have changed since it was read */
    private assertWritten(id: string, result: RobotWriteResult) {
        if (result === 'not_found') {
            this.logger.warn('robot_not_found', { id });
            throw new NotFoundException('robot_not_found');
        }
        if (result === 'has_matches') {
            this.logger.error('robot_has_matches', { id });
            throw new ConflictException('robot_has_matches');
        }
    }

    private async rethrowNameTaken<T>(save: () => Promise<T>): Promise<T> {
        try {
            return await save();
        } catch (error) {
            if (isUniqueViolation(error)) {
                this.logger.error('robot_name_taken', {
                    reason: 'unique_violation',
                });
                throw new ConflictException('robot_name_taken');
            }
            throw error;
        }
    }
}
