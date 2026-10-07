import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRobotWeightClassAndTeam1791338122000 implements MigrationInterface {
    name = 'AddRobotWeightClassAndTeam1791338122000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "robots" ADD "weight_class" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "robots" ADD "team" character varying NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "robots" DROP COLUMN "team"`);
        await queryRunner.query(`ALTER TABLE "robots" DROP COLUMN "weight_class"`);
    }

}
