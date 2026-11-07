import { MigrationInterface, QueryRunner } from 'typeorm';

export class Arenas1793992763252 implements MigrationInterface {
    name = 'Arenas1793992763252';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "arenas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "modified_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying NOT NULL, "device_id" character varying NOT NULL, "token_hash" character varying NOT NULL, "current_match_id" uuid, CONSTRAINT "UQ_arenas_current_match_id" UNIQUE ("current_match_id"), CONSTRAINT "UQ_arenas_device_id" UNIQUE ("device_id"), CONSTRAINT "UQ_arenas_name" UNIQUE ("name"), CONSTRAINT "PK_f7751ba5f7bf4ae194a1c1dfe64" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(`ALTER TABLE "matches" ADD "arena_id" uuid`);
        await queryRunner.query(
            `ALTER TABLE "matches" ADD CONSTRAINT "FK_2df96ba4877e3cb9d23b0263159" FOREIGN KEY ("arena_id") REFERENCES "arenas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "arenas" ADD CONSTRAINT "FK_c86e164e15c8b62e5f5c4c61217" FOREIGN KEY ("current_match_id") REFERENCES "matches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "arenas" DROP CONSTRAINT "FK_c86e164e15c8b62e5f5c4c61217"`,
        );
        await queryRunner.query(
            `ALTER TABLE "matches" DROP CONSTRAINT "FK_2df96ba4877e3cb9d23b0263159"`,
        );
        await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "arena_id"`);
        await queryRunner.query(`DROP TABLE "arenas"`);
    }
}
