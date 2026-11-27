import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type QueryDeepPartialEntity } from 'typeorm';
import {
    MatchVideo,
    type AnalysisStatus,
} from './entities/match-video.entity.js';

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

    /**
     * Applies a CV worker result in one statement, and only while it still describes the match's
     * confirmed video (`videoKey`) and the analysis is in one of `from`. Checking both in the
     * WHERE keeps a stale or out-of-order result from overwriting a newer state, even if a
     * re-record is confirmed at the same moment. Returns false when nothing was changed.
     */
    async updateAnalysis(
        matchId: string,
        videoKey: string,
        from: readonly AnalysisStatus[],
        changes: Pick<
            MatchVideo,
            'analysisStatus' | 'analysisError' | 'analysisResult'
        >,
    ): Promise<boolean> {
        const result = await this.repository
            .createQueryBuilder()
            .update(MatchVideo)
            // TypeORM's partial type does not accept a Record for a jsonb column; it is stored as is
            .set({
                ...changes,
                analysisUpdatedAt: () => 'now()',
            } as QueryDeepPartialEntity<MatchVideo>)
            .where('match_id = :matchId', { matchId })
            .andWhere('object_key = :videoKey', { videoKey })
            .andWhere("status = 'uploaded'")
            .andWhere('analysis_status IN (:...from)', { from })
            .execute();
        return (result.affected ?? 0) > 0;
    }

    /**
     * Fails, in one statement, the analyses of confirmed videos left in `running` since before
     * `runningBefore` or in `pending` since before `pendingBefore` (#133). Returns each one with
     * the status it had (Postgres 18 RETURNING old). A row without `analysis_updated_at` (written
     * by an API instance from before the column) counts from its upload.
     */
    async failStaleAnalyses(
        runningBefore: Date,
        pendingBefore: Date,
    ): Promise<{ matchId: string; previousStatus: 'running' | 'pending' }[]> {
        const [rows]: [
            { match_id: string; previous_status: 'running' | 'pending' }[],
            number,
        ] = await this.repository.query(
            `UPDATE "match_videos"
             SET "analysis_status" = 'failed', "analysis_error" = 'processing_timeout',
                 "analysis_result" = NULL, "analysis_updated_at" = now()
             WHERE "status" = 'uploaded' AND "deleted_at" IS NULL AND (
                 ("analysis_status" = 'running'
                     AND COALESCE("analysis_updated_at", "uploaded_at", "modified_at") < $1)
                 OR ("analysis_status" = 'pending'
                     AND COALESCE("analysis_updated_at", "uploaded_at", "modified_at") < $2)
             )
             RETURNING "match_id", old."analysis_status" AS "previous_status"`,
            [runningBefore, pendingBefore],
        );
        return rows.map((row) => ({
            matchId: row.match_id,
            previousStatus: row.previous_status,
        }));
    }

    save(video: MatchVideo): Promise<MatchVideo> {
        return this.repository.save(video);
    }
}
