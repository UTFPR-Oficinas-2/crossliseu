import {
    Controller,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../auth/current-user-id.decorator.js';
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
