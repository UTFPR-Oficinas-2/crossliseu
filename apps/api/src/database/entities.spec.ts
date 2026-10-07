import 'reflect-metadata';
import { DataSource } from 'typeorm';
import type { EntityTarget, ObjectLiteral } from 'typeorm';
import { Championship } from '../modules/championships/entities/championship.entity.js';
import { Match } from '../modules/matches/entities/match.entity.js';
import { Robot } from '../modules/robots/entities/robot.entity.js';
import { User } from '../modules/users/entities/user.entity.js';

async function buildDataSource(): Promise<DataSource> {
    const dataSource = new DataSource({
        type: 'postgres',
        entities: [Championship, Match, Robot, User],
    });
    // buildMetadatas is protected; it only reads decorators and never connects
    await (
        dataSource as unknown as { buildMetadatas(): Promise<void> }
    ).buildMetadatas();
    return dataSource;
}

function foreignKeys(
    dataSource: DataSource,
    entity: EntityTarget<ObjectLiteral>,
) {
    return dataSource
        .getMetadata(entity)
        .foreignKeys.map((fk) => ({
            name: fk.name,
            columns: fk.columnNames,
            references: fk.referencedTablePath,
        }))
        .sort((a, b) => a.columns[0].localeCompare(b.columns[0]));
}

describe('entity metadata', () => {
    it('championship has no relations', async () => {
        const dataSource = await buildDataSource();

        expect(dataSource.getMetadata(Championship).relations).toEqual([]);
    });

    it('robot references its championship through championship_id', async () => {
        const dataSource = await buildDataSource();

        expect(foreignKeys(dataSource, Robot)).toEqual([
            {
                name: 'FK_2e86c7099a40300394be352cd73',
                columns: ['championship_id'],
                references: 'championships',
            },
        ]);
    });

    it('match references its championship and both robots', async () => {
        const dataSource = await buildDataSource();

        expect(foreignKeys(dataSource, Match)).toEqual([
            {
                name: 'FK_8ad570b1c3ccf31a649c5b7e661',
                columns: ['championship_id'],
                references: 'championships',
            },
            {
                name: 'FK_b988c0c8a16f37aaffcd46f4c3d',
                columns: ['robot_a_id'],
                references: 'robots',
            },
            {
                name: 'FK_5b8f9b1ffd5b1c295978331dc4e',
                columns: ['robot_b_id'],
                references: 'robots',
            },
        ]);
    });

    it('match columns are not nullable', async () => {
        const dataSource = await buildDataSource();
        const columns = dataSource
            .getMetadata(Match)
            .columns.filter((column) =>
                ['championship_id', 'robot_a_id', 'robot_b_id'].includes(
                    column.databaseName,
                ),
            );

        expect(columns).toHaveLength(3);
        expect(columns.every((column) => !column.isNullable)).toBe(true);
    });
});
