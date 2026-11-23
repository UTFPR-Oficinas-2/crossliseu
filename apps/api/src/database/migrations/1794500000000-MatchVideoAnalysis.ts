import { MigrationInterface, QueryRunner } from 'typeorm';

/** The CV worker's analysis of each confirmed video (#21): status, error and result */
export class MatchVideoAnalysis1794500000000 implements MigrationInterface {
    name = 'MatchVideoAnalysis1794500000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "match_videos" ADD "analysis_status" character varying, ADD "analysis_error" character varying, ADD "analysis_result" jsonb`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_videos" ADD CONSTRAINT "CHK_match_videos_analysis_status" CHECK ("analysis_status" IN ('pending', 'running', 'done', 'failed'))`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "match_videos" DROP CONSTRAINT "CHK_match_videos_analysis_status"`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_videos" DROP COLUMN "analysis_result", DROP COLUMN "analysis_error", DROP COLUMN "analysis_status"`,
        );
    }
}
