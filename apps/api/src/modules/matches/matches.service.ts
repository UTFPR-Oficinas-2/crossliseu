import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MatchesRepository } from './repositories/matches.repository.js';
import { Log } from 'typeorm/driver/mongodb/typings.js';
import { Match } from './entities/match.entity.js';

@Injectable()
export class MatchesService {
    logger: Logger = new Logger(MatchesService.name);

    constructor(private readonly matchesRepository: MatchesRepository) {}

    findAll() {
        return this.matchesRepository.findAll();
    }

    findById(id: string) {
        const match = this.matchesRepository.findById(id);

        if (!match) {
            this.logger.error('match_not_found', { id: id });
            throw new NotFoundException('match_not_found');
        }

        return match;
    }

    create(weightClass: string) {
        return this.matchesRepository.create(weightClass);
    }
}
