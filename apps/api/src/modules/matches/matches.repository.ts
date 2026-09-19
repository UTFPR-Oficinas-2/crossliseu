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

    findAll(): Promise<Match[]> {
        return this.repository.find();
    }

    findOne(id: string): Promise<Match | null> {
        return this.repository.findOneBy({ id });
    }

    update() {
        // TODO
    }

    remove() {
        // TODO
    }
}
