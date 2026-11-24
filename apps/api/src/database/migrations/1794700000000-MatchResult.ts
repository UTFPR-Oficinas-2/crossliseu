import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The official result (#50): `winner_robot_id` holds only a confirmed winner, `draw` a confirmed
 * draw, and `surrendered_robot_id` the robot that gave up. A surrender used to write the winner at
 * once, so existing surrender rows get their surrendered robot from it, and the ones never closed
 * lose that unconfirmed winner.
 */
export class MatchResult1794700000000 implements MigrationInterface {
    name = 'MatchResult1794700000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "matches" ADD "draw" boolean NOT NULL DEFAULT false, ADD "surrendered_robot_id" uuid`,
        );
        await queryRunner.query(
            `ALTER TABLE "matches" ADD CONSTRAINT "FK_matches_surrendered_robot_id" FOREIGN KEY ("surrendered_robot_id") REFERENCES "robots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `UPDATE "matches"
             SET "surrendered_robot_id" = CASE WHEN "winner_robot_id" = "robot_a_id" THEN "robot_b_id" ELSE "robot_a_id" END
             WHERE "end_reason" = 'surrender' AND "winner_robot_id" IS NOT NULL`,
        );
        await queryRunner.query(
            `UPDATE "matches" SET "winner_robot_id" = NULL
             WHERE "end_reason" = 'surrender' AND NOT EXISTS (
                 SELECT 1 FROM "match_events"
                 WHERE "match_events"."match_id" = "matches"."id" AND "match_events"."type" = 'closed'
             )`,
        );
        await queryRunner.query(
            `ALTER TABLE "matches" ADD CONSTRAINT "CHK_matches_result" CHECK (NOT ("draw" AND "winner_robot_id" IS NOT NULL))`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Unclosed surrender fights get back the winner a surrender used to write at once
        await queryRunner.query(
            `UPDATE "matches"
             SET "winner_robot_id" = CASE WHEN "surrendered_robot_id" = "robot_a_id" THEN "robot_b_id" ELSE "robot_a_id" END
             WHERE "surrendered_robot_id" IS NOT NULL AND "winner_robot_id" IS NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "matches" DROP CONSTRAINT "CHK_matches_result"`,
        );
        await queryRunner.query(
            `ALTER TABLE "matches" DROP CONSTRAINT "FK_matches_surrendered_robot_id"`,
        );
        await queryRunner.query(
            `ALTER TABLE "matches" DROP COLUMN "surrendered_robot_id", DROP COLUMN "draw"`,
        );
    }
}
