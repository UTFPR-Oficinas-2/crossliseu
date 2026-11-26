import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * When the analysis status last changed (#133), so analyses the CV worker never finishes can be
 * failed after a while. Existing analyses start their clock at the upload of their video, so the
 * ones already stuck are failed by the first sweep after the deploy.
 */
export class MatchVideoAnalysisUpdatedAt1794800000000 implements MigrationInterface {
    name = 'MatchVideoAnalysisUpdatedAt1794800000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "match_videos" ADD "analysis_updated_at" TIMESTAMP WITH TIME ZONE`,
        );
        await queryRunner.query(
            `UPDATE "match_videos" SET "analysis_updated_at" = COALESCE("uploaded_at", "modified_at")
             WHERE "analysis_status" IS NOT NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "match_videos" DROP COLUMN "analysis_updated_at"`,
        );
    }
}
