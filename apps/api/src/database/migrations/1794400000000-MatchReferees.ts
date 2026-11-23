import { MigrationInterface, QueryRunner } from 'typeorm';

/** The shared referee token of a match and the seats its referees hold by name (#18) */
export class MatchReferees1794400000000 implements MigrationInterface {
    name = 'MatchReferees1794400000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "matches" ADD "referee_token" character varying, ADD CONSTRAINT "UQ_matches_referee_token" UNIQUE ("referee_token")`,
        );
        await queryRunner.query(
            `CREATE TABLE "match_referees" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "match_id" uuid NOT NULL, "name" character varying NOT NULL, "seat" integer NOT NULL, "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_match_referees_match_id_seat" UNIQUE ("match_id", "seat"), CONSTRAINT "CHK_match_referees_seat" CHECK ("seat" IN (1, 2, 3)), CONSTRAINT "PK_match_referees" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_match_referees_match_id_lower_name" ON "match_referees" ("match_id", lower("name"))`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_referees" ADD CONSTRAINT "FK_match_referees_match_id" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "match_referees"`);
        await queryRunner.query(
            `ALTER TABLE "matches" DROP CONSTRAINT "UQ_matches_referee_token", DROP COLUMN "referee_token"`,
        );
    }
}
