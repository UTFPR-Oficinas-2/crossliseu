import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fight recordings stored in R2 (#45): one row per match, see docs/recording-storage.md */
export class MatchVideos1794300000000 implements MigrationInterface {
    name = 'MatchVideos1794300000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "match_videos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "modified_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "match_id" uuid NOT NULL, "object_key" character varying NOT NULL, "content_type" character varying NOT NULL, "status" character varying NOT NULL, "size_bytes" bigint, "uploaded_at" TIMESTAMP WITH TIME ZONE, "uploaded_by_user_id" uuid NOT NULL, CONSTRAINT "CHK_match_videos_status" CHECK ("status" IN ('uploading', 'uploaded')), CONSTRAINT "PK_ba7041a3689a40ae8546c504595" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_match_videos_match_id" ON "match_videos" ("match_id")`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_videos" ADD CONSTRAINT "FK_a0cbbc8bc14aa96d6b2004a4cf5" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_videos" ADD CONSTRAINT "FK_01bae172a92d6b0866a84e5ad8a" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "match_videos" DROP CONSTRAINT "FK_01bae172a92d6b0866a84e5ad8a"`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_videos" DROP CONSTRAINT "FK_a0cbbc8bc14aa96d6b2004a4cf5"`,
        );
        await queryRunner.query(`DROP INDEX "UQ_match_videos_match_id"`);
        await queryRunner.query(`DROP TABLE "match_videos"`);
    }
}
