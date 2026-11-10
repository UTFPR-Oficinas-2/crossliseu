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
import { CurrentUserId } from '../auth/current-user-id.decorator.js';
import {
    CompleteRecordingDto,
    RequestUploadUrlDto,
} from './dto/recording.dto.js';
import { RecordingsService } from './recordings.service.js';

/** Routes under /matches/:id/recording; both need the JWT (no @Public) */
@ApiTags('recordings')
@ApiBearerAuth()
@Controller('matches')
export class RecordingsController {
    constructor(private readonly recordingsService: RecordingsService) {}

    /** Step 1: a presigned R2 URL for one PUT of this match's video */
    @Post(':id/recording/upload-url')
    @HttpCode(HttpStatus.OK)
    requestUploadUrl(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() { contentType }: RequestUploadUrlDto,
        @CurrentUserId() userId: string,
    ) {
        return this.recordingsService.requestUploadUrl(id, contentType, userId);
    }

    /** Step 3: the browser finished the PUT; the video is stored as uploaded */
    @Post(':id/recording/complete')
    @HttpCode(HttpStatus.NO_CONTENT)
    complete(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() body: CompleteRecordingDto,
        @CurrentUserId() userId: string,
    ) {
        return this.recordingsService.complete(id, body, userId);
    }
}
