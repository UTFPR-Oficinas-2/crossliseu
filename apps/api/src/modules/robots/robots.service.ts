import {
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { RobotsRepository } from './robots.repository.js';
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

    async create(createRobotDto: CreateRobotDto) {
        const { name, weightClass, team, championshipId } = createRobotDto;

        // Throws championship_not_found when it does not exist
        await this.championshipsService.findOne(championshipId);
        await this.assertNameAvailable(championshipId, name);

        const robot: Robot = new Robot(name, weightClass, team, championshipId);

        return this.rethrowNameTaken(() => this.robotsRepository.create(robot));
    }

    findAll(championshipId?: string) {
        return this.robotsRepository.findAll(championshipId);
    }

    async findOne(id: string) {
        const robot = await this.robotsRepository.findOne(id);

        if (!robot) {
            this.logger.error('robot_not_found', { id: id });
            throw new NotFoundException('robot_not_found');
        }

        return robot;
    }

    async update(id: string, updateRobotDto: UpdateRobotDto) {
        const robot = await this.findOne(id);

        if (updateRobotDto.name !== undefined) {
            await this.assertNameAvailable(
                robot.championshipId,
                updateRobotDto.name,
                id,
            );
        }

        if (
            updateRobotDto.weightClass !== undefined &&
            updateRobotDto.weightClass !== robot.weightClass
        ) {
            // A match pairs robots of one weight class (MatchesService.resolveRobots)
            await this.assertHasNoMatches(id);
        }

        await this.rethrowNameTaken(() =>
            this.robotsRepository.update(id, updateRobotDto),
        );

        return this.findOne(id);
    }

    async remove(id: string) {
        await this.findOne(id);
        // Matches keep pointing at their robots; a soft-deleted robot would orphan them
        await this.assertHasNoMatches(id);
        await this.robotsRepository.remove(id);
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

    private async assertHasNoMatches(id: string) {
        if (await this.robotsRepository.hasMatches(id)) {
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
