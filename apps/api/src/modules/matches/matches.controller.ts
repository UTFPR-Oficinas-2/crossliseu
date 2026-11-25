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
import { CloseMatchDto } from './dto/close-match.dto.js';
import { CorrectEndReasonDto } from './dto/correct-end-reason.dto.js';
import type { FightCommand } from './fight/fight-transitions.js';
import { FightService } from './fight/fight.service.js';
import type {
    CommandOptions,
    EndReasonCorrection,
} from './fight/fight.service.js';
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
    state(
        @Param('id', ParseUUIDPipe) id: string,
        @Query('view') view?: string,
    ) {
        return view === 'operator'
            ? this.fightService.operatorState(id)
            : this.fightService.state(id);
    }

    @Post(':id/start')
    @HttpCode(HttpStatus.OK)
    start(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUserId() userId: string,
        @Query('view') view?: string,
    ) {
        return this.runFightCommand(id, 'start', userId, view);
    }

    @Post(':id/pause')
    @HttpCode(HttpStatus.OK)
    pause(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUserId() userId: string,
        @Query('view') view?: string,
    ) {
        return this.runFightCommand(id, 'pause', userId, view);
    }

    @Post(':id/resume')
    @HttpCode(HttpStatus.OK)
    resume(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUserId() userId: string,
        @Query('view') view?: string,
    ) {
        return this.runFightCommand(id, 'resume', userId, view);
    }

    @Post(':id/finish')
    @HttpCode(HttpStatus.OK)
    finish(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUserId() userId: string,
        @Query('view') view?: string,
    ) {
        return this.runFightCommand(id, 'finish', userId, view);
    }

    @Post(':id/close')
    @HttpCode(HttpStatus.OK)
    close(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUserId() userId: string,
        @Query('view') view?: string,
        @Body() body?: CloseMatchDto,
    ) {
        // Confirms the official result: the server's proposal, or a draw with `{ draw: true }` (#50)
        const options: CommandOptions = { draw: body?.draw === true };
        return view === 'operator'
            ? this.fightService.operatorCommand(id, 'close', userId, options)
            : this.fightService.command(id, 'close', userId, options);
    }

    @Patch(':id/end-reason')
    @HttpCode(HttpStatus.OK)
    correctEndReason(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUserId() userId: string,
        @Body() body: CorrectEndReasonDto,
        @Query('view') view?: string,
    ) {
        // Before close only; the winner is still written at close (#57)
        const correction: EndReasonCorrection = {
            endReason: body.endReason,
            ...(body.side !== undefined && { side: body.side }),
        };
        return view === 'operator'
            ? this.fightService.operatorCorrectEndReason(id, userId, correction)
            : this.fightService.correctEndReason(id, userId, correction);
    }

    private runFightCommand(
        id: string,
        command: FightCommand,
        userId: string,
        view?: string,
    ) {
        return view === 'operator'
            ? this.fightService.operatorCommand(id, command, userId)
            : this.fightService.command(id, command, userId);
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
