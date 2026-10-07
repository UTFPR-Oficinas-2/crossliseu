import type { QueryRunner } from 'typeorm';
import { RobotNameUniquePerChampionship1791500000000 } from './migrations/1791500000000-RobotNameUniquePerChampionship.js';

// The SQL itself was checked against Postgres; this pins the order of the normalization
async function upQueries(): Promise<string[]> {
    const queries: string[] = [];
    const queryRunner = {
        query: (sql: string) => {
            queries.push(sql);
            return Promise.resolve([]);
        },
    } as unknown as QueryRunner;
    await new RobotNameUniquePerChampionship1791500000000().up(queryRunner);
    return queries;
}

describe('RobotNameUniquePerChampionship1791500000000', () => {
    it('collapses whitespace before trimming, so edge tabs and newlines are dropped', async () => {
        const [update] = await upQueries();

        expect(update).toContain(
            `"name" = btrim(regexp_replace("name", '\\s+', ' ', 'g'))`,
        );
        expect(update).toContain(
            `"team" = btrim(regexp_replace("team", '\\s+', ' ', 'g'))`,
        );
        expect(update).not.toContain('regexp_replace(btrim(');
    });
});
