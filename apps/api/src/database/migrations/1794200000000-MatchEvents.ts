import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces the unused match_pauses and match_score_events tables with one match_events timeline
 * and drops matches.started_at / finished_at (the started / finished events carry them now).
 */
export class MatchEvents1794200000000 implements MigrationInterface {
    name = 'MatchEvents1794200000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "match_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "match_id" uuid NOT NULL, "type" character varying NOT NULL, "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL, "actor_user_id" uuid, "robot_id" uuid, "judge_seat" integer, "action" integer, CONSTRAINT "CHK_match_events_action" CHECK ("action" IS NULL OR "action" IN (1, -1)), CONSTRAINT "CHK_match_events_judge_seat" CHECK ("judge_seat" IS NULL OR "judge_seat" IN (1, 2, 3)), CONSTRAINT "CHK_match_events_score_fields" CHECK (("type" = 'scored' AND "robot_id" IS NOT NULL AND "judge_seat" IS NOT NULL AND "action" IS NOT NULL) OR ("type" <> 'scored' AND "robot_id" IS NULL AND "judge_seat" IS NULL AND "action" IS NULL)), CONSTRAINT "CHK_match_events_type" CHECK ("type" IN ('started', 'paused', 'resumed', 'finished', 'closed', 'scored')), CONSTRAINT "PK_34160ac79fb420bdc42a6b24854" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_match_events_match_id_occurred_at" ON "match_events" ("match_id", "occurred_at")`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_match_events_once" ON "match_events" ("match_id", "type") WHERE "type" IN ('started', 'finished', 'closed')`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_events" ADD CONSTRAINT "FK_5bd1e02201ebf85de3ba5b70a83" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_events" ADD CONSTRAINT "FK_3638d3dbfbf6ec7199317ea6bea" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_events" ADD CONSTRAINT "FK_8e0dbd3ed091d23e8457b9e636a" FOREIGN KEY ("robot_id") REFERENCES "robots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(`DROP INDEX "UQ_match_pauses_open"`);
        await queryRunner.query(
            `ALTER TABLE "match_pauses" DROP CONSTRAINT "FK_bb2ae853a73f2a8d15ae2e5ca7d"`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_pauses" DROP CONSTRAINT "FK_51d2bb76d8ba21992fad7a74fb6"`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_score_events" DROP CONSTRAINT "FK_debff7b318176953ab4ebb0e377"`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_score_events" DROP CONSTRAINT "FK_191bdd101531869dd18824d1f62"`,
        );
        await queryRunner.query(`DROP TABLE "match_pauses"`);
        await queryRunner.query(`DROP TABLE "match_score_events"`);
        await queryRunner.query(
            `ALTER TABLE "matches" DROP COLUMN "started_at"`,
        );
        await queryRunner.query(
            `ALTER TABLE "matches" DROP COLUMN "finished_at"`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "matches" ADD "started_at" TIMESTAMP WITH TIME ZONE`,
        );
        await queryRunner.query(
            `ALTER TABLE "matches" ADD "finished_at" TIMESTAMP WITH TIME ZONE`,
        );
        await queryRunner.query(
            `CREATE TABLE "match_pauses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "match_id" uuid NOT NULL, "paused_by_user_id" uuid NOT NULL, "paused_at" TIMESTAMP WITH TIME ZONE NOT NULL, "resumed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_6a3532c1aadf8d9fb2430c72aa8" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "match_score_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "match_id" uuid NOT NULL, "robot_id" uuid NOT NULL, "judge_seat" integer NOT NULL, "action" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_match_score_events_action" CHECK ("action" IN (1, -1)), CONSTRAINT "CHK_match_score_events_judge_seat" CHECK ("judge_seat" IN (1, 2, 3)), CONSTRAINT "PK_04852145386d4d892fd00864fcb" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_pauses" ADD CONSTRAINT "FK_bb2ae853a73f2a8d15ae2e5ca7d" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_pauses" ADD CONSTRAINT "FK_51d2bb76d8ba21992fad7a74fb6" FOREIGN KEY ("paused_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_score_events" ADD CONSTRAINT "FK_debff7b318176953ab4ebb0e377" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_score_events" ADD CONSTRAINT "FK_191bdd101531869dd18824d1f62" FOREIGN KEY ("robot_id") REFERENCES "robots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_match_pauses_open" ON "match_pauses" ("match_id") WHERE "resumed_at" IS NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_events" DROP CONSTRAINT "FK_8e0dbd3ed091d23e8457b9e636a"`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_events" DROP CONSTRAINT "FK_3638d3dbfbf6ec7199317ea6bea"`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_events" DROP CONSTRAINT "FK_5bd1e02201ebf85de3ba5b70a83"`,
        );
        await queryRunner.query(`DROP INDEX "UQ_match_events_once"`);
        await queryRunner.query(
            `DROP INDEX "IDX_match_events_match_id_occurred_at"`,
        );
        await queryRunner.query(`DROP TABLE "match_events"`);
    }
}
