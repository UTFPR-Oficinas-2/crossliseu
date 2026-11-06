import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArenasService } from './arenas.service.js';
import type { ArenaResponse } from './dto/arena-response.dto.js';

@ApiTags('arenas')
@ApiBearerAuth()
@Controller('arenas')
export class ArenasController {
    constructor(private readonly arenasService: ArenasService) {}

    @Get()
    findAll(): Promise<ArenaResponse[]> {
        return this.arenasService.findAll();
    }
}
