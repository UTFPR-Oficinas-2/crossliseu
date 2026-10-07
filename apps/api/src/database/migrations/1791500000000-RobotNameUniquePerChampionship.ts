import { MigrationInterface, QueryRunner } from 'typeorm';

export class RobotNameUniquePerChampionship1791500000000 implements MigrationInterface {
    name = 'RobotNameUniquePerChampionship1791500000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Same normalization as the robot DTO (dto/normalize.ts), so old names compare like new ones.
        // Whitespace runs collapse to one space first, then btrim drops the edge space: btrim alone
        // strips only spaces, so a tab or newline at either edge would survive as a space.
        // weight_class is left alone: older rows may hold text outside WEIGHT_CLASSES.
        await queryRunner.query(
            `UPDATE "robots" SET "name" = btrim(regexp_replace("name", '\\s+', ' ', 'g')), "team" = btrim(regexp_replace("team", '\\s+', ' ', 'g'))`,
        );
        const duplicates: unknown[] = await queryRunner.query(
            `SELECT "championship_id", lower("name") AS "name" FROM "robots" WHERE "deleted_at" IS NULL GROUP BY 1, 2 HAVING COUNT(*) > 1`,
        );
        if (duplicates.length > 0) {
            throw new Error(
                `Rename robots with duplicate names before running this migration: ${JSON.stringify(duplicates)}`,
            );
        }
        // Backstop for RobotsService.assertNameAvailable; a soft-deleted robot frees its name
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_robots_championship_id_lower_name" ON "robots" ("championship_id", lower("name")) WHERE "deleted_at" IS NULL`,
        );
    }

    // The normalization in up() is not reverted
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP INDEX "UQ_robots_championship_id_lower_name"`,
        );
    }
}
