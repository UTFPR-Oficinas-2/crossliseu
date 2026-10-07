import { MigrationInterface, QueryRunner } from "typeorm";

export class MatchChampionshipIdAndRobots1791400000000 implements MigrationInterface {
    name = 'MatchChampionshipIdAndRobots1791400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Existing matches predate robots and cannot satisfy the new NOT NULL columns.
        // Plain DELETE also removes soft-deleted rows.
        await queryRunner.query(`DELETE FROM "matches"`);
        await queryRunner.query(`ALTER TABLE "matches" DROP CONSTRAINT "FK_1750dd2a6f7095f6b2bc8890979"`);
        await queryRunner.query(`ALTER TABLE "matches" RENAME COLUMN "championshipId" TO "championship_id"`);
        await queryRunner.query(`ALTER TABLE "matches" ALTER COLUMN "championship_id" SET NOT NULL`);
        // No longer mapped by the Match entity
        await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "start_date"`);
        await queryRunner.query(`ALTER TABLE "matches" ADD "robot_a_id" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "matches" ADD "robot_b_id" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "matches" ADD CONSTRAINT "FK_8ad570b1c3ccf31a649c5b7e661" FOREIGN KEY ("championship_id") REFERENCES "championships"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "matches" ADD CONSTRAINT "FK_b988c0c8a16f37aaffcd46f4c3d" FOREIGN KEY ("robot_a_id") REFERENCES "robots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "matches" ADD CONSTRAINT "FK_5b8f9b1ffd5b1c295978331dc4e" FOREIGN KEY ("robot_b_id") REFERENCES "robots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    // Matches deleted by up() are not restored
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "matches" DROP CONSTRAINT "FK_5b8f9b1ffd5b1c295978331dc4e"`);
        await queryRunner.query(`ALTER TABLE "matches" DROP CONSTRAINT "FK_b988c0c8a16f37aaffcd46f4c3d"`);
        await queryRunner.query(`ALTER TABLE "matches" DROP CONSTRAINT "FK_8ad570b1c3ccf31a649c5b7e661"`);
        await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "robot_b_id"`);
        await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "robot_a_id"`);
        await queryRunner.query(`ALTER TABLE "matches" ADD "start_date" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "matches" ALTER COLUMN "championship_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "matches" RENAME COLUMN "championship_id" TO "championshipId"`);
        await queryRunner.query(`ALTER TABLE "matches" ADD CONSTRAINT "FK_1750dd2a6f7095f6b2bc8890979" FOREIGN KEY ("championshipId") REFERENCES "championships"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
