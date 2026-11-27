import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * When the analysis status last changed (#133), so analyses the CV worker never finishes can be
 * failed after a while. Analyses still `pending` or `running` at deploy time start their clock at
 * the deploy, since a live job cannot be told from a stuck one; a stuck one is swept once its limit
 * passes. Finished analyses take the upload of their video.
 */
export class MatchVideoAnalysisUpdatedAt1794800000000 implements MigrationInterface {
    name = 'MatchVideoAnalysisUpdatedAt1794800000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "match_videos" ADD "analysis_updated_at" TIMESTAMP WITH TIME ZONE`,
        );
        await queryRunner.query(
            `UPDATE "match_videos" SET "analysis_updated_at" = CASE
                 WHEN "analysis_status" IN ('pending', 'running') THEN now()
                 ELSE COALESCE("uploaded_at", "modified_at")
             END
             WHERE "analysis_status" IS NOT NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "match_videos" DROP COLUMN "analysis_updated_at"`,
        );
    }
}
