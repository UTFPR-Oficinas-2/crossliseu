import { MigrationInterface, QueryRunner } from 'typeorm';

/** A re-record no longer overwrites the confirmed video: the new upload waits in these columns */
export class MatchVideoPendingUpload1794300000001 implements MigrationInterface {
    name = 'MatchVideoPendingUpload1794300000001';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "match_videos" ADD "pending_object_key" character varying, ADD "pending_content_type" character varying`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "match_videos" DROP COLUMN "pending_content_type", DROP COLUMN "pending_object_key"`,
        );
    }
}
