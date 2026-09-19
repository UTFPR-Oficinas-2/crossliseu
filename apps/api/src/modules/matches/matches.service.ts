import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MatchesRepository } from './repositories/matches.repository.js';
import { Log } from 'typeorm/driver/mongodb/typings.js';
import { Match } from './entities/match.entity.js';
import { CreateMatchDto } from './dto/create-match.dto.js';

@Injectable()
export class MatchesService {
    logger: Logger = new Logger(MatchesService.name);

    constructor(private readonly matchesRepository: MatchesRepository) {}

    create(createMatchDto: CreateMatchDto) {
        const { weightClass } = createMatchDto;

        const match: Match = new Match(weightClass);

        return this.matchesRepository.create(match);
    }

    findAll() {
        return this.matchesRepository.findAll();
    }

    findOne(id: string) {
        const match = this.matchesRepository.findById(id);

        if (!match) {
            this.logger.error('match_not_found', { id: id });
            throw new NotFoundException('match_not_found');
        }

        return match;
    }
}
