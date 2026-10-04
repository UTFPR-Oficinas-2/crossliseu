import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateChampionships1791148895466 implements MigrationInterface {
    name = 'CreateChampionships1791148895466'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "championships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "modified_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying NOT NULL, "scheduled_date" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_0f99e3669ee9b045b47cc8c916d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "matches" ADD "scheduled_date" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "matches" ADD "championshipId" uuid`);
        await queryRunner.query(`ALTER TABLE "matches" ADD CONSTRAINT "FK_1750dd2a6f7095f6b2bc8890979" FOREIGN KEY ("championshipId") REFERENCES "championships"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "matches" DROP CONSTRAINT "FK_1750dd2a6f7095f6b2bc8890979"`);
        await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "championshipId"`);
        await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "scheduled_date"`);
        await queryRunner.query(`DROP TABLE "championships"`);
    }

}
