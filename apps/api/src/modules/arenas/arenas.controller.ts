import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../auth/current-user-id.decorator.js';
import { ArenasService } from './arenas.service.js';
import type { ArenaResponse } from './dto/arena-response.dto.js';
import { SetCurrentMatchDto } from './dto/set-current-match.dto.js';

@ApiTags('arenas')
@ApiBearerAuth()
@Controller('arenas')
export class ArenasController {
    constructor(private readonly arenasService: ArenasService) {}

    @Get()
    findAll(@CurrentUserId() userId: string): Promise<ArenaResponse[]> {
        return this.arenasService.findAll(userId);
    }

    @Put(':id/current-match')
    setCurrentMatch(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: SetCurrentMatchDto,
        @CurrentUserId() userId: string,
    ): Promise<ArenaResponse> {
        return this.arenasService.setCurrentMatch(id, dto, userId);
    }
}
