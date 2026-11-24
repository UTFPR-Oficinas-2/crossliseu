import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A fight no longer has a planned date: it is ordered by created_at and its start is the
 * `started` match event. Rolling back re-adds the column empty; the dates are not recoverable.
 */
export class DropMatchScheduledAt1794600000000 implements MigrationInterface {
    name = 'DropMatchScheduledAt1794600000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "matches" DROP COLUMN "scheduled_at"`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "matches" ADD "scheduled_at" TIMESTAMP WITH TIME ZONE`,
        );
    }
}
