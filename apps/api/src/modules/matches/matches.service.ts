import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MatchesRepository } from './repositories/matches.repository.js';
import { Log } from 'typeorm/driver/mongodb/typings.js';

@Injectable()
export class MatchesService {
    logger: Logger = new Logger(MatchesService.name);

    constructor(private readonly matchesRepository: MatchesRepository) {}

    public findAll() {
        return this.matchesRepository.findAll();
    }

    public findById(id: string) {
        const match = this.matchesRepository.findById(id);

        if (!match) {
            this.logger.error('match_not_found', { id: id });
            throw new NotFoundException('match_not_found');
        }
    }
}
