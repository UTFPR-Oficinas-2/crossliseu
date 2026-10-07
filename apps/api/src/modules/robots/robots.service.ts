import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RobotsRepository } from './robots.repository.js';
import { Robot } from './entities/robot.entity.js';
import { CreateRobotDto } from './dto/create-robot.dto.js';
import { UpdateRobotDto } from './dto/update-robot.dto.js';
import { ChampionshipsService } from '../championships/championships.service.js';

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

        const robot: Robot = new Robot(name, weightClass, team, championshipId);

        return this.robotsRepository.create(robot);
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
        await this.findOne(id);
        await this.robotsRepository.update(id, updateRobotDto);

        return this.findOne(id);
    }

    async remove(id: string) {
        await this.findOne(id);
        await this.robotsRepository.remove(id);
    }
}
