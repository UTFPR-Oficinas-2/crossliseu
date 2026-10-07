import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChampionshipDates1791220460108 implements MigrationInterface {
    name = 'ChampionshipDates1791220460108';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "championships" ADD "start_date" TIMESTAMP WITH TIME ZONE`,
        );
        await queryRunner.query(
            `ALTER TABLE "championships" ADD "end_date" TIMESTAMP WITH TIME ZONE`,
        );
        await queryRunner.query(
            `ALTER TABLE "championships" ADD "status" character varying`,
        );
        await queryRunner.query(
            `UPDATE "championships" SET "start_date" = COALESCE("scheduled_date", "created_at"), "end_date" = COALESCE("scheduled_date", "created_at")`,
        );
        // Same rule as Championship.setInitialStatus, which compares UTC dates
        await queryRunner.query(
            `UPDATE "championships" SET "status" = CASE WHEN ("end_date" AT TIME ZONE 'UTC')::date < (now() AT TIME ZONE 'UTC')::date THEN 'closed' WHEN ("start_date" AT TIME ZONE 'UTC')::date > (now() AT TIME ZONE 'UTC')::date THEN 'scheduled' ELSE 'ongoing' END`,
        );
        await queryRunner.query(
            `ALTER TABLE "championships" ALTER COLUMN "start_date" SET NOT NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "championships" ALTER COLUMN "end_date" SET NOT NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "championships" ALTER COLUMN "status" SET NOT NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "championships" DROP COLUMN "scheduled_date"`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "championships" ADD "scheduled_date" TIMESTAMP WITH TIME ZONE`,
        );
        await queryRunner.query(
            `UPDATE "championships" SET "scheduled_date" = "start_date"`,
        );
        await queryRunner.query(
            `ALTER TABLE "championships" DROP COLUMN "status"`,
        );
        await queryRunner.query(
            `ALTER TABLE "championships" DROP COLUMN "end_date"`,
        );
        await queryRunner.query(
            `ALTER TABLE "championships" DROP COLUMN "start_date"`,
        );
    }
}
