import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../auth/current-user-id.decorator.js';
import { Public } from '../../auth/public-decorator.js';
import { JoinRefereeDto } from './dto/join-referee.dto.js';
import { RefereesService } from './referees.service.js';

@ApiTags('referees')
@ApiBearerAuth()
@Controller('matches')
export class RefereesController {
    constructor(private readonly referees: RefereesService) {}

    /** Owner-only; idempotent. Called when the operator opens the match screen. */
    @Post(':id/referee-token')
    @HttpCode(HttpStatus.OK)
    refereeToken(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUserId() userId: string,
    ) {
        return this.referees.issueToken(id, userId);
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
