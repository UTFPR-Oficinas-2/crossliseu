import { Injectable } from '@nestjs/common';
import { ArenasRepository } from './arenas.repository.js';
import { ArenaResponse } from './dto/arena-response.dto.js';
import type { Arena } from './entities/arena.entity.js';

@Injectable()
export class ArenasService {
    constructor(private readonly arenasRepository: ArenasRepository) {}

    async findAll(): Promise<ArenaResponse[]> {
        const arenas = await this.arenasRepository.findAll();
        return arenas.map((arena) => this.toResponse(arena));
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
