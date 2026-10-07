import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateChampionshipEntity1791221062474 implements MigrationInterface {
    name = 'UpdateChampionshipEntity1791221062474';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "matches" RENAME COLUMN "scheduled_date" TO "date"`,
        );
        await queryRunner.query(
            `CREATE TABLE "robots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "modified_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying NOT NULL, "championshipId" uuid, CONSTRAINT "PK_43f57cdb413e91d08657cb72062" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `ALTER TABLE "robots" ADD CONSTRAINT "FK_d2a7198f0696e167827aaa4190a" FOREIGN KEY ("championshipId") REFERENCES "championships"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "robots" DROP CONSTRAINT "FK_d2a7198f0696e167827aaa4190a"`,
        );
        await queryRunner.query(`DROP TABLE "robots"`);
        await queryRunner.query(
            `ALTER TABLE "matches" RENAME COLUMN "date" TO "scheduled_date"`,
        );
    }
}
