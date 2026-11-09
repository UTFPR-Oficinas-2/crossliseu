import 'reflect-metadata';
import { DataSource } from 'typeorm';
import type { EntityTarget, ObjectLiteral } from 'typeorm';
import { Arena } from '../modules/arenas/entities/arena.entity.js';
import { Championship } from '../modules/championships/entities/championship.entity.js';
import { Match } from '../modules/matches/entities/match.entity.js';
import { MatchEvent } from '../modules/matches/entities/match-event.entity.js';
import { Robot } from '../modules/robots/entities/robot.entity.js';
import { User } from '../modules/users/entities/user.entity.js';

async function buildDataSource(): Promise<DataSource> {
    const dataSource = new DataSource({
        type: 'postgres',
        entities: [Arena, Championship, Match, MatchEvent, Robot, User],
    });
    // buildMetadatas is protected; it only reads decorators and never connects
    await (
        dataSource as unknown as { buildMetadatas(): Promise<void> }
    ).buildMetadatas();
    return dataSource;
}

/** `column → referenced table`, sorted by column, so generated FK names don't matter */
async function foreignKeys(entity: EntityTarget<ObjectLiteral>) {
    const dataSource = await buildDataSource();
    return dataSource
        .getMetadata(entity)
        .foreignKeys.map(
            (fk) => `${fk.columnNames.join(',')} → ${fk.referencedTablePath}`,
        )
        .sort();
}

async function nullableColumns(entity: EntityTarget<ObjectLiteral>) {
    const dataSource = await buildDataSource();
    return dataSource
        .getMetadata(entity)
        .columns.filter((column) => column.isNullable)
        .map((column) => column.databaseName)
        .sort();
}

async function columnNames(entity: EntityTarget<ObjectLiteral>) {
    const dataSource = await buildDataSource();
    return dataSource
        .getMetadata(entity)
        .columns.map((column) => column.databaseName)
        .sort();
}

describe('entity metadata', () => {
    it('championship references its creator', async () => {
        expect(await foreignKeys(Championship)).toEqual([
            'created_by_user_id → users',
        ]);
    });

    it('championship status is not stored', async () => {
        expect(await columnNames(Championship)).not.toContain('status');
    });

    it('robot references its championship and creator', async () => {
        expect(await foreignKeys(Robot)).toEqual([
            'championship_id → championships',
            'created_by_user_id → users',
        ]);
    });

    it('match references its championship, creator, both robots and the winner', async () => {
        expect(await foreignKeys(Match)).toEqual([
            'arena_id → arenas',
            'championship_id → championships',
            'created_by_user_id → users',
            'robot_a_id → robots',
            'robot_b_id → robots',
            'winner_robot_id → robots',
        ]);
    });

    it('match has the diagram columns', async () => {
        expect(await columnNames(Match)).toEqual([
            'arena_id',
            'championship_id',
            'created_at',
            'created_by_user_id',
            'deleted_at',
            'end_reason',
            'id',
            'modified_at',
            'robot_a_id',
            'robot_b_id',
            'scheduled_at',
            'state',
            'weight_class',
            'winner_robot_id',
        ]);
    });

    it('only the outcome, timing and audit columns of a match are nullable', async () => {
        expect(await nullableColumns(Match)).toEqual([
            'arena_id',
            'deleted_at',
            'end_reason',
            'winner_robot_id',
        ]);
    });

    it('arena references its current match and owner', async () => {
        expect(await foreignKeys(Arena)).toEqual([
            'current_match_id → matches',
            'owner_user_id → users',
        ]);
    });

    it('arena has the device and current match columns', async () => {
        expect(await columnNames(Arena)).toEqual([
            'created_at',
            'current_match_id',
            'deleted_at',
            'device_id',
            'id',
            'modified_at',
            'name',
            'owner_user_id',
            'token_hash',
        ]);
    });

    it('only the current match and deleted_at of an arena are nullable', async () => {
        expect(await nullableColumns(Arena)).toEqual([
            'current_match_id',
            'deleted_at',
        ]);
    });

    it.each(['UQ_arenas_device_id', 'UQ_arenas_current_match_id'])(
        'arena declares %s',
        async (name) => {
            const dataSource = await buildDataSource();

            expect(
                dataSource
                    .getMetadata(Arena)
                    .uniques.map((unique) => unique.name),
            ).toContain(name);
        },
    );

    it('arena no longer has a globally unique name', async () => {
        const dataSource = await buildDataSource();

        expect(
            dataSource.getMetadata(Arena).uniques.map((unique) => unique.name),
        ).not.toContain('UQ_arenas_name');
    });

    it('match event references its match, actor and robot', async () => {
        expect(await foreignKeys(MatchEvent)).toEqual([
            'actor_user_id → users',
            'match_id → matches',
            'robot_id → robots',
        ]);
    });

    it('only the actor and score fields of a match event are nullable', async () => {
        expect(await nullableColumns(MatchEvent)).toEqual([
            'action',
            'actor_user_id',
            'judge_seat',
            'robot_id',
        ]);
    });

    it('match event has no soft delete or modified_at', async () => {
        expect(await columnNames(MatchEvent)).toEqual([
            'action',
            'actor_user_id',
            'id',
            'judge_seat',
            'match_id',
            'occurred_at',
            'robot_id',
            'type',
        ]);
    });

    it.each([
        [User, 'UQ_users_lower_username'],
        [User, 'UQ_users_lower_email'],
        [Robot, 'UQ_robots_championship_id_lower_name'],
        [Arena, 'UQ_arenas_owner_user_id_lower_name'],
        [MatchEvent, 'UQ_match_events_once'],
    ] as const)(
        'keeps the migration-managed index %#, %s, out of synchronization',
        async (entity, name) => {
            const dataSource = await buildDataSource();
            const index = dataSource
                .getMetadata(entity)
                .indices.find((entry) => entry.name === name);

            expect(index?.synchronize).toBe(false);
        },
    );

    it.each([User, Championship, Robot, Match] as const)(
        'modified_at of %o is a NOT NULL update date stamped by TypeORM',
        async (entity) => {
            const dataSource = await buildDataSource();
            const column = dataSource
                .getMetadata(entity)
                .findColumnWithDatabaseName('modified_at');

            expect(column?.isUpdateDate).toBe(true);
            expect(column?.isNullable).toBe(false);
        },
    );

    it.each([
        [Robot, 'CHK_robots_weight_class'],
        [Match, 'CHK_matches_weight_class'],
        [Match, 'CHK_matches_state'],
        [Match, 'CHK_matches_end_reason'],
        [MatchEvent, 'CHK_match_events_type'],
        [MatchEvent, 'CHK_match_events_score_fields'],
        [MatchEvent, 'CHK_match_events_judge_seat'],
        [MatchEvent, 'CHK_match_events_action'],
    ] as const)('%o declares %s', async (entity, name) => {
        const dataSource = await buildDataSource();

        expect(
            dataSource.getMetadata(entity).checks.map((check) => check.name),
        ).toContain(name);
    });
});
