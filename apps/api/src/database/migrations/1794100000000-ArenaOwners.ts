import { MigrationInterface, QueryRunner } from 'typeorm';

export class ArenaOwners1794100000000 implements MigrationInterface {
    name = 'ArenaOwners1794100000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "arenas" ADD "owner_user_id" uuid`,
        );
        // Arenas that predate ownership go to the oldest live user
        await queryRunner.query(
            `UPDATE "arenas" SET "owner_user_id" = (SELECT "id" FROM "users" WHERE "deleted_at" IS NULL ORDER BY "created_at" ASC LIMIT 1)`,
        );
        const orphans: unknown[] = await queryRunner.query(
            `SELECT 1 FROM "arenas" WHERE "owner_user_id" IS NULL LIMIT 1`,
        );
        if (orphans.length > 0) {
            throw new Error(
                'ArenaOwners: arenas exist but there is no live user to own them',
            );
        }
        await queryRunner.query(
            `ALTER TABLE "arenas" ALTER COLUMN "owner_user_id" SET NOT NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE "arenas" ADD CONSTRAINT "FK_47df72708a7a50ba3e1233f6cc7" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "arenas" DROP CONSTRAINT "UQ_arenas_name"`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_arenas_owner_user_id_lower_name" ON "arenas" ("owner_user_id", lower("name")) WHERE "deleted_at" IS NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DROP INDEX "UQ_arenas_owner_user_id_lower_name"`,
        );
        // Fails if two owners have arenas with the same name
        await queryRunner.query(
            `ALTER TABLE "arenas" ADD CONSTRAINT "UQ_arenas_name" UNIQUE ("name")`,
        );
        await queryRunner.query(
            `ALTER TABLE "arenas" DROP CONSTRAINT "FK_47df72708a7a50ba3e1233f6cc7"`,
        );
        await queryRunner.query(
            `ALTER TABLE "arenas" DROP COLUMN "owner_user_id"`,
        );
    }
}
