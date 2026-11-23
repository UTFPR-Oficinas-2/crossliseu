import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Post,
    UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../auth/current-user-id.decorator.js';
import { Public } from '../../auth/public-decorator.js';
import { JoinRefereeDto } from './dto/join-referee.dto.js';
import { FightService } from '../fight/fight.service.js';
import { SubmitScoreDto } from './dto/submit-score.dto.js';
import { RefereesService } from './referees.service.js';

@ApiTags('referees')
@ApiBearerAuth()
@Controller('matches')
export class RefereesController {
    constructor(
        private readonly referees: RefereesService,
        private readonly fight: FightService,
    ) {}

    /** Owner-only; idempotent. Called when the operator opens the match screen. */
    @Post(':id/referee-token')
    @HttpCode(HttpStatus.OK)
    refereeToken(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUserId() userId: string,
    ) {
        return this.referees.issueToken(id, userId);
    }

    /**
     * Public: the referee's token and name are the credential. 401 referee_invalid_token unless
     * they hold a seat on this match; 409 match_not_running or score_below_zero.
     */
    @Public()
    @Post(':id/scores')
    async score(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() body: SubmitScoreDto,
    ) {
        const seat = await this.referees.resolve(body.token, body.name);
        if (!seat || seat.matchId !== id) {
            throw new UnauthorizedException('referee_invalid_token');
        }
        return {
            counts: await this.fight.score(
                id,
                seat.seat,
                body.side,
                body.action,
            ),
        };
    }
}

/** The referees' own endpoints: no account, the shared token and a name instead */
@ApiTags('referees')
@Controller('referee')
export class RefereeJoinController {
    constructor(private readonly referees: RefereesService) {}

    @Public()
    @Post('join')
    @HttpCode(HttpStatus.OK)
    join(@Body() body: JoinRefereeDto) {
        return this.referees.join(body.token, body.name);
    }
}
