import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Match } from '../entities/match.entity.js';
import { Repository } from 'typeorm';

@Injectable()
export class MatchesRepository {
    constructor(
        @InjectRepository(Match)
        private readonly repository: Repository<Match>,
    ) {}

    findAll(): Promise<Match[]> {
        return this.repository.find();
    }

    findById(id: string): Promise<Match | null> {
        return this.repository.findOneBy({ id });
    }

    create(weightClass: string): Promise<Match> {
        const match = this.repository.create({ weightClass });
        return this.repository.save(match);
    }
}
