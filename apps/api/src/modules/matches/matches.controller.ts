import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CreateMatchDto } from './dto/create-match.dto.js';
import { UpdateMatchDto } from './dto/update-match.dto.js';
import { FightService } from './fight/fight.service.js';
import { MatchesService } from './matches.service.js';
import { Public } from '../auth/public-decorator.js';
import { CurrentUserId } from '../auth/current-user-id.decorator.js';

@ApiTags('matches')
@ApiBearerAuth()
@Controller('matches')
export class MatchesController {
    constructor(
        private readonly matchesService: MatchesService,
        private readonly fightService: FightService,
    ) {}

    @Post()
    create(
        @Body() createMatchDto: CreateMatchDto,
        @CurrentUserId() userId: string,
    ) {
        return this.matchesService.create(createMatchDto, userId);
    }

    @Public()
    @Get()
    @ApiQuery({ name: 'championshipId', required: false })
    findAll(
        @Query('championshipId', new ParseUUIDPipe({ optional: true }))
        championshipId?: string,
    ) {
        return this.matchesService.findAll(championshipId);
    }

    @Public()
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.matchesService.findOne(id);
    }

    @Public()
    @Get(':id/state')
    state(@Param('id', ParseUUIDPipe) id: string) {
        return this.fightService.state(id);
    }

    @Post(':id/start')
    @HttpCode(HttpStatus.OK)
    start(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUserId() userId: string,
    ) {
        return this.fightService.command(id, 'start', userId);
    }

    @Post(':id/pause')
    @HttpCode(HttpStatus.OK)
    pause(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUserId() userId: string,
    ) {
        return this.fightService.command(id, 'pause', userId);
    }

    @Post(':id/resume')
    @HttpCode(HttpStatus.OK)
    resume(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUserId() userId: string,
    ) {
        return this.fightService.command(id, 'resume', userId);
    }

    @Post(':id/finish')
    @HttpCode(HttpStatus.OK)
    finish(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUserId() userId: string,
    ) {
        return this.fightService.command(id, 'finish', userId);
    }

    @Post(':id/close')
    @HttpCode(HttpStatus.OK)
    close(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUserId() userId: string,
    ) {
        return this.fightService.command(id, 'close', userId);
    }

    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateMatchDto: UpdateMatchDto,
        @CurrentUserId() userId: string,
    ) {
        return this.matchesService.update(id, updateMatchDto, userId);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUserId() userId: string,
    ) {
        return this.matchesService.remove(id, userId);
    }
}
