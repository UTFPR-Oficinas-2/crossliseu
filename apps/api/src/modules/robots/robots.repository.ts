import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Robot } from './entities/robot.entity.js';
import { Raw, Repository } from 'typeorm';

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
            // Registration order keeps the organizer list stable
            order: { createdAt: 'ASC' },
        });
    }

    findOne(id: string): Promise<Robot | null> {
        return this.repository.findOneBy({ id });
    }

    /** The live robot in the championship with this name, ignoring case */
    findByName(championshipId: string, name: string): Promise<Robot | null> {
        return this.repository.findOne({
            where: {
                championshipId,
                name: Raw((alias) => `LOWER(${alias}) = LOWER(:name)`, {
                    name,
                }),
            },
        });
    }

    update(id: string, partialRobot: Partial<Robot>) {
        return this.repository.update({ id }, partialRobot);
    }

    remove(id: string) {
        return this.repository.softDelete({ id });
    }
}
