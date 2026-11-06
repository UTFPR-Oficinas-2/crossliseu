import {
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import {
    ArenasRepository,
    type SetCurrentMatchResult,
} from './arenas.repository.js';
import { ArenaResponse } from './dto/arena-response.dto.js';
import { SetCurrentMatchDto } from './dto/set-current-match.dto.js';
import type { Arena } from './entities/arena.entity.js';

@Injectable()
export class ArenasService {
    logger: Logger = new Logger(ArenasService.name);

    constructor(private readonly arenasRepository: ArenasRepository) {}

    async findAll(): Promise<ArenaResponse[]> {
        const arenas = await this.arenasRepository.findAll();
        return arenas.map((arena) => this.toResponse(arena));
    }

    /**
     * Selects (or swaps to) the scheduled match the arena will run next. Selecting the
     * arena's current match again changes nothing.
     */
    async setCurrentMatch(
        arenaId: string,
        dto: SetCurrentMatchDto,
    ): Promise<ArenaResponse> {
        const result = await this.arenasRepository.setCurrentMatch(
            arenaId,
            dto.matchId,
        );
        if (result !== 'done') {
            this.logger.warn(result, { arenaId, matchId: dto.matchId });
            throw toException(result);
        }

        const arena = await this.arenasRepository.findOne(arenaId);
        if (!arena) {
            // Deleted right after the write
            this.logger.warn('arena_not_found', { arenaId });
            throw new NotFoundException('arena_not_found');
        }
        return this.toResponse(arena);
    }

    /** Leaves the arena without a current match (used when a match ends, #17) */
    async clearCurrentMatch(arenaId: string): Promise<void> {
        if (!(await this.arenasRepository.clearCurrentMatch(arenaId))) {
            this.logger.warn('arena_not_found', { arenaId });
            throw new NotFoundException('arena_not_found');
        }
    }

    private toResponse(arena: Arena): ArenaResponse {
        return {
            id: arena.id,
            name: arena.name,
            // Becomes real once arena devices connect (#19)
            online: false,
            currentMatchId: arena.currentMatchId,
        };
    }
}

function toException(
    result: Exclude<SetCurrentMatchResult, 'done'>,
): NotFoundException | ConflictException {
    switch (result) {
        case 'arena_not_found':
        case 'match_not_found':
            return new NotFoundException(result);
        case 'match_not_scheduled':
        case 'match_already_current':
        case 'arena_match_started':
            return new ConflictException(result);
    }
}
