import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Match } from './entities/match.entity.js';
import { Repository } from 'typeorm';

@Injectable()
export class MatchesRepository {
    constructor(
        @InjectRepository(Match)
        private readonly repository: Repository<Match>,
    ) {}

    create(match: Match): Promise<Match> {
        return this.repository.save(match);
    }

    findAll(championshipId?: string): Promise<Match[]> {
        return this.repository.find({
            where: championshipId ? { championshipId } : {},
            // Robot names for the organizer list without one request per robot
            relations: { robotA: true, robotB: true },
            // Fights are ordered manually by creation; there is no bracket
            order: { createdAt: 'ASC' },
        });
    }

    findOne(id: string): Promise<Match | null> {
        return this.repository.findOneBy({ id });
    }

    update(id: string, partialMatch: Partial<Match>) {
        return this.repository.update({ id }, partialMatch);
    }

    remove(id: string) {
        return this.repository.softDelete({ id });
    }
}
