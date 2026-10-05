import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMatchStatus1791222468546 implements MigrationInterface {
    name = 'AddMatchStatus1791222468546'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Rename instead of drop/add so existing match dates survive
        await queryRunner.query(`ALTER TABLE "matches" RENAME COLUMN "date" TO "start_date"`);
        // Existing matches have not been fought yet
        await queryRunner.query(`ALTER TABLE "matches" ADD "state" character varying NOT NULL DEFAULT 'waiting'`);
        await queryRunner.query(`ALTER TABLE "matches" ALTER COLUMN "state" DROP DEFAULT`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "state"`);
        await queryRunner.query(`ALTER TABLE "matches" RENAME COLUMN "start_date" TO "date"`);
    }

}
