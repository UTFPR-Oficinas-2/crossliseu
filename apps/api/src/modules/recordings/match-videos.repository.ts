import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchVideo } from './entities/match-video.entity.js';

@Injectable()
export class MatchVideosRepository {
    constructor(
        @InjectRepository(MatchVideo)
        private readonly repository: Repository<MatchVideo>,
    ) {}

    findByMatch(matchId: string): Promise<MatchVideo | null> {
        return this.repository.findOne({ where: { matchId } });
    }

    /**
     * Registers a new upload for the match in one statement, so two requests at once cannot both
     * insert. A new match gets its row; an existing one keeps its confirmed video and only gets the
     * pending key and content type.
     */
    async requestUpload(input: {
        matchId: string;
        objectKey: string;
        contentType: string;
        userId: string;
    }): Promise<MatchVideo> {
        await this.repository
            .createQueryBuilder()
            .insert()
            .into(MatchVideo)
            .values({
                matchId: input.matchId,
                objectKey: input.objectKey,
                contentType: input.contentType,
                status: 'uploading',
                pendingObjectKey: input.objectKey,
                pendingContentType: input.contentType,
                uploadedByUserId: input.userId,
            })
            .orUpdate(
                [
                    'pending_object_key',
                    'pending_content_type',
                    'uploaded_by_user_id',
                    'modified_at',
                ],
                ['match_id'],
            )
            .execute();
        return (await this.findByMatch(input.matchId))!;
    }

    save(video: MatchVideo): Promise<MatchVideo> {
        return this.repository.save(video);
    }
}
