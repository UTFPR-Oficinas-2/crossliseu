import { MigrationInterface, QueryRunner } from "typeorm";

export class RobotChampionshipId1791338632000 implements MigrationInterface {
    name = 'RobotChampionshipId1791338632000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "robots" DROP CONSTRAINT "FK_d2a7198f0696e167827aaa4190a"`);
        // Rename instead of drop/add so existing robots keep their championship
        await queryRunner.query(`ALTER TABLE "robots" RENAME COLUMN "championshipId" TO "championship_id"`);
        await queryRunner.query(`ALTER TABLE "robots" ALTER COLUMN "championship_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "robots" ADD CONSTRAINT "FK_2e86c7099a40300394be352cd73" FOREIGN KEY ("championship_id") REFERENCES "championships"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "robots" DROP CONSTRAINT "FK_2e86c7099a40300394be352cd73"`);
        await queryRunner.query(`ALTER TABLE "robots" ALTER COLUMN "championship_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "robots" RENAME COLUMN "championship_id" TO "championshipId"`);
        await queryRunner.query(`ALTER TABLE "robots" ADD CONSTRAINT "FK_d2a7198f0696e167827aaa4190a" FOREIGN KEY ("championshipId") REFERENCES "championships"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
