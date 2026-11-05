import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1793846336401 implements MigrationInterface {
    name = 'InitialSchema1793846336401';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "modified_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "username" character varying NOT NULL, "email" character varying NOT NULL, "password" character varying NOT NULL, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "championships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "modified_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying NOT NULL, "start_date" TIMESTAMP WITH TIME ZONE NOT NULL, "end_date" TIMESTAMP WITH TIME ZONE NOT NULL, "created_by_user_id" uuid NOT NULL, CONSTRAINT "PK_0f99e3669ee9b045b47cc8c916d" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "robots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "modified_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying NOT NULL, "weight_class" character varying NOT NULL, "team" character varying NOT NULL, "championship_id" uuid NOT NULL, "created_by_user_id" uuid NOT NULL, CONSTRAINT "CHK_robots_weight_class" CHECK ("weight_class" IN ('fairyweight', 'antweight', 'beetleweight', 'hobbyweight', 'featherweight', 'lightweight')), CONSTRAINT "PK_43f57cdb413e91d08657cb72062" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "matches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "modified_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "weight_class" character varying NOT NULL, "state" character varying NOT NULL, "end_reason" character varying, "scheduled_at" TIMESTAMP WITH TIME ZONE NOT NULL, "started_at" TIMESTAMP WITH TIME ZONE, "finished_at" TIMESTAMP WITH TIME ZONE, "championship_id" uuid NOT NULL, "robot_a_id" uuid NOT NULL, "robot_b_id" uuid NOT NULL, "winner_robot_id" uuid, "created_by_user_id" uuid NOT NULL, CONSTRAINT "CHK_matches_end_reason" CHECK ("end_reason" IS NULL OR "end_reason" IN ('time_out', 'manual', 'surrender')), CONSTRAINT "CHK_matches_state" CHECK ("state" IN ('scheduled', 'ongoing', 'paused', 'finished')), CONSTRAINT "CHK_matches_weight_class" CHECK ("weight_class" IN ('fairyweight', 'antweight', 'beetleweight', 'hobbyweight', 'featherweight', 'lightweight')), CONSTRAINT "PK_8a22c7b2e0828988d51256117f4" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "match_pauses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "match_id" uuid NOT NULL, "paused_by_user_id" uuid NOT NULL, "paused_at" TIMESTAMP WITH TIME ZONE NOT NULL, "resumed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_6a3532c1aadf8d9fb2430c72aa8" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `CREATE TABLE "match_score_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "match_id" uuid NOT NULL, "robot_id" uuid NOT NULL, "judge_seat" integer NOT NULL, "action" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_match_score_events_action" CHECK ("action" IN (1, -1)), CONSTRAINT "CHK_match_score_events_judge_seat" CHECK ("judge_seat" IN (1, 2, 3)), CONSTRAINT "PK_04852145386d4d892fd00864fcb" PRIMARY KEY ("id"))`,
        );
        await queryRunner.query(
            `ALTER TABLE "championships" ADD CONSTRAINT "FK_625993ec70d88f5e60de4bb7c45" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "robots" ADD CONSTRAINT "FK_2e86c7099a40300394be352cd73" FOREIGN KEY ("championship_id") REFERENCES "championships"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "robots" ADD CONSTRAINT "FK_125c52089bb2187decf6351d533" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "matches" ADD CONSTRAINT "FK_8ad570b1c3ccf31a649c5b7e661" FOREIGN KEY ("championship_id") REFERENCES "championships"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "matches" ADD CONSTRAINT "FK_b988c0c8a16f37aaffcd46f4c3d" FOREIGN KEY ("robot_a_id") REFERENCES "robots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "matches" ADD CONSTRAINT "FK_5b8f9b1ffd5b1c295978331dc4e" FOREIGN KEY ("robot_b_id") REFERENCES "robots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "matches" ADD CONSTRAINT "FK_e6e54b865c9ce6dd0d2900b6bf0" FOREIGN KEY ("winner_robot_id") REFERENCES "robots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "matches" ADD CONSTRAINT "FK_9d761d3a02569698091a3a29f3c" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_pauses" ADD CONSTRAINT "FK_bb2ae853a73f2a8d15ae2e5ca7d" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_pauses" ADD CONSTRAINT "FK_51d2bb76d8ba21992fad7a74fb6" FOREIGN KEY ("paused_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_score_events" ADD CONSTRAINT "FK_debff7b318176953ab4ebb0e377" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_score_events" ADD CONSTRAINT "FK_191bdd101531869dd18824d1f62" FOREIGN KEY ("robot_id") REFERENCES "robots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
        // Partial expression indexes TypeORM can't express; the entities mark them `synchronize: false`.
        // A soft-deleted user or robot frees its username, email or name.
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_users_lower_username" ON "users" (lower("username")) WHERE "deleted_at" IS NULL`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_users_lower_email" ON "users" (lower("email")) WHERE "deleted_at" IS NULL`,
        );
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_robots_championship_id_lower_name" ON "robots" ("championship_id", lower("name")) WHERE "deleted_at" IS NULL`,
        );
        // At most one open pause per match
        await queryRunner.query(
            `CREATE UNIQUE INDEX "UQ_match_pauses_open" ON "match_pauses" ("match_id") WHERE "resumed_at" IS NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "UQ_match_pauses_open"`);
        await queryRunner.query(
            `DROP INDEX "UQ_robots_championship_id_lower_name"`,
        );
        await queryRunner.query(`DROP INDEX "UQ_users_lower_email"`);
        await queryRunner.query(`DROP INDEX "UQ_users_lower_username"`);
        await queryRunner.query(
            `ALTER TABLE "match_score_events" DROP CONSTRAINT "FK_191bdd101531869dd18824d1f62"`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_score_events" DROP CONSTRAINT "FK_debff7b318176953ab4ebb0e377"`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_pauses" DROP CONSTRAINT "FK_51d2bb76d8ba21992fad7a74fb6"`,
        );
        await queryRunner.query(
            `ALTER TABLE "match_pauses" DROP CONSTRAINT "FK_bb2ae853a73f2a8d15ae2e5ca7d"`,
        );
        await queryRunner.query(
            `ALTER TABLE "matches" DROP CONSTRAINT "FK_9d761d3a02569698091a3a29f3c"`,
        );
        await queryRunner.query(
            `ALTER TABLE "matches" DROP CONSTRAINT "FK_e6e54b865c9ce6dd0d2900b6bf0"`,
        );
        await queryRunner.query(
            `ALTER TABLE "matches" DROP CONSTRAINT "FK_5b8f9b1ffd5b1c295978331dc4e"`,
        );
        await queryRunner.query(
            `ALTER TABLE "matches" DROP CONSTRAINT "FK_b988c0c8a16f37aaffcd46f4c3d"`,
        );
        await queryRunner.query(
            `ALTER TABLE "matches" DROP CONSTRAINT "FK_8ad570b1c3ccf31a649c5b7e661"`,
        );
        await queryRunner.query(
            `ALTER TABLE "robots" DROP CONSTRAINT "FK_125c52089bb2187decf6351d533"`,
        );
        await queryRunner.query(
            `ALTER TABLE "robots" DROP CONSTRAINT "FK_2e86c7099a40300394be352cd73"`,
        );
        await queryRunner.query(
            `ALTER TABLE "championships" DROP CONSTRAINT "FK_625993ec70d88f5e60de4bb7c45"`,
        );
        await queryRunner.query(`DROP TABLE "match_score_events"`);
        await queryRunner.query(`DROP TABLE "match_pauses"`);
        await queryRunner.query(`DROP TABLE "matches"`);
        await queryRunner.query(`DROP TABLE "robots"`);
        await queryRunner.query(`DROP TABLE "championships"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }
}
