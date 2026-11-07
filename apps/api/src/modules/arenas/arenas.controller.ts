import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../auth/current-user-id.decorator.js';
import { ArenasService } from './arenas.service.js';
import { ArenaNameDto } from './dto/arena-name.dto.js';
import type { ArenaResponse } from './dto/arena-response.dto.js';
import type { DeviceCredentials } from './dto/device-credentials.dto.js';
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

    @Post()
    create(
        @Body() dto: ArenaNameDto,
        @CurrentUserId() userId: string,
    ): Promise<{ arena: ArenaResponse; credentials: DeviceCredentials }> {
        return this.arenasService.create(dto, userId);
    }

    @Patch(':id')
    rename(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: ArenaNameDto,
        @CurrentUserId() userId: string,
    ): Promise<ArenaResponse> {
        return this.arenasService.rename(id, dto, userId);
    }

    @Post(':id/token')
    @HttpCode(200)
    rotateToken(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUserId() userId: string,
    ): Promise<DeviceCredentials> {
        return this.arenasService.rotateToken(id, userId);
    }

    @Delete(':id')
    @HttpCode(204)
    remove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUserId() userId: string,
    ): Promise<void> {
        return this.arenasService.remove(id, userId);
    }

    @Put(':id/current-match')
    setCurrentMatch(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: SetCurrentMatchDto,
        @CurrentUserId() userId: string,
    ): Promise<ArenaResponse> {
        return this.arenasService.setCurrentMatch(id, dto, userId);
    }

    @Delete(':id/current-match')
    clearCurrentMatch(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUserId() userId: string,
    ): Promise<ArenaResponse> {
        return this.arenasService.clearCurrentMatch(id, userId);
    }
}
