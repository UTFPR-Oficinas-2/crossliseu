import {
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { ChampionshipsService } from '../championships/championships.service.js';
import { MatchesService } from '../matches/matches.service.js';
import type {
    CompleteRecordingDto,
    RecordingContentType,
} from './dto/recording.dto.js';
import { MatchVideo } from './entities/match-video.entity.js';
import { MatchVideosRepository } from './match-videos.repository.js';
import { RecordingStorage } from './recording-storage.js';

/** How long an upload URL works: long enough to start a ~90 MB upload, short if it leaks */
export const UPLOAD_URL_TTL_SECONDS = 15 * 60;

const EXTENSIONS: Record<RecordingContentType, string> = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
};

/** "recordings/<matchId>.mp4": the R2 key of a match's recording */
export function recordingKey(
    matchId: string,
    contentType: RecordingContentType,
) {
    return `recordings/${matchId}.${EXTENSIONS[contentType]}`;
}

/**
 * Fight recordings (#45, docs/recording-storage.md). The video never goes through the API: it
 * hands out a presigned R2 URL, the browser PUTs the file to R2, then confirms here.
 */
@Injectable()
export class RecordingsService {
    private readonly logger = new Logger(RecordingsService.name);

    constructor(
        private readonly matchesService: MatchesService,
        private readonly championshipsService: ChampionshipsService,
        private readonly videos: MatchVideosRepository,
        private readonly storage: RecordingStorage,
    ) {}

    /**
     * Step 1. Owner-only: a match in someone else's championship answers 404 match_not_found,
     * like the other match routes. Recording again overwrites the previous video.
     */
    async requestUploadUrl(
        matchId: string,
        contentType: RecordingContentType,
        userId: string,
    ) {
        await this.assertOwned(matchId, userId);

        const key = recordingKey(matchId, contentType);
        const url = await this.storage.presignUpload(
            key,
            contentType,
            UPLOAD_URL_TTL_SECONDS,
        );

        const video =
            (await this.videos.findByMatch(matchId)) ?? new MatchVideo();
        video.matchId = matchId;
        video.objectKey = key;
        video.contentType = contentType;
        video.status = 'uploading';
        video.sizeBytes = null;
        video.uploadedAt = null;
        video.uploadedByUserId = userId;
        await this.videos.save(video);

        return {
            url,
            key,
            expiresAt: new Date(
                Date.now() + UPLOAD_URL_TTL_SECONDS * 1000,
            ).toISOString(),
        };
    }

    /**
     * Step 3. Accepts only the key handed out in step 1, and only once the object is in R2 with
     * the size the browser sent. 409 recording_not_requested / recording_not_uploaded /
     * recording_size_mismatch.
     */
    async complete(
        matchId: string,
        { key, size }: CompleteRecordingDto,
        userId: string,
    ) {
        await this.assertOwned(matchId, userId);

        const video = await this.videos.findByMatch(matchId);
        if (!video || video.objectKey !== key) {
            this.logger.warn('recording_not_requested', { matchId, key });
            throw new ConflictException('recording_not_requested');
        }

        const storedSize = await this.storage.objectSize(key);
        if (storedSize === null) {
            this.logger.warn('recording_not_uploaded', { matchId, key });
            throw new ConflictException('recording_not_uploaded');
        }
        if (storedSize !== size) {
            this.logger.warn('recording_size_mismatch', {
                matchId,
                key,
                sent: size,
                stored: storedSize,
            });
            throw new ConflictException('recording_size_mismatch');
        }

        video.status = 'uploaded';
        video.sizeBytes = storedSize;
        video.uploadedAt = new Date();
        await this.videos.save(video);
    }

    private async assertOwned(matchId: string, userId: string) {
        // 404 match_not_found when it does not exist
        const match = await this.matchesService.findOne(matchId);
        if (
            !(await this.championshipsService.isOwnedBy(
                match.championshipId,
                userId,
            ))
        ) {
            this.logger.warn('match_not_found', { id: matchId });
            throw new NotFoundException('match_not_found');
        }
    }
}
