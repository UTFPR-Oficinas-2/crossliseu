import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Robot } from './entities/robot.entity.js';
import { Repository } from 'typeorm';

@Injectable()
export class RobotsRepository {
    constructor(
        @InjectRepository(Robot)
        private readonly repository: Repository<Robot>,
    ) {}

    create(robot: Robot): Promise<Robot> {
        return this.repository.save(robot);
    }

    findAll(championshipId?: string): Promise<Robot[]> {
        return this.repository.find({
            where: championshipId ? { championshipId } : {},
        });
    }

    findOne(id: string): Promise<Robot | null> {
        return this.repository.findOneBy({ id });
    }

    update(id: string, partialRobot: Partial<Robot>) {
        return this.repository.update({ id }, partialRobot);
    }

    remove(id: string) {
        return this.repository.softDelete({ id });
    }
}
