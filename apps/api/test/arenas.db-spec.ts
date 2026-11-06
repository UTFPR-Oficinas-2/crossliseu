import type { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { ArenasRepository } from '../src/modules/arenas/arenas.repository.js';
import { Championship } from '../src/modules/championships/entities/championship.entity.js';
import { Arena } from '../src/modules/arenas/entities/arena.entity.js';
import type { MatchState } from '../src/modules/matches/entities/match.entity.js';
import {
    createTestApp,
    createUser,
    dataSourceOf,
    loginToken,
    resetDatabase,
    seedArena,
    seedChampionship,
    seedMatch,
    seedRobot,
} from './helpers.js';

const UNKNOWN_ID = '99999999-9999-4999-8999-999999999999';

describe('arenas (db)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let arenas: ArenasRepository;
    let token: string;
    let tokenB: string;
    let ownerA: string;
    let ids: {
        arena1: string;
        arena2: string;
        m1: string;
        m2: string;
        arenaB: string;
        mB: string;
    };

    beforeAll(async () => {
        app = await createTestApp();
        ds = dataSourceOf(app);
        arenas = app.get(ArenasRepository);
    });

    beforeEach(async () => {
        await resetDatabase(ds);
        ownerA = (await createUser(ds, 'admin', 'pw')).id;
        token = await loginToken(app, 'admin', 'pw');
        const championship = await seedChampionship(ds);
        const [a, b] = await Promise.all(
            ['Titã', 'Marte'].map((name) =>
                seedRobot(ds, championship.id, { name }),
            ),
        );
        const m1 = await seedMatch(ds, championship.id, a!.id, b!.id);
        const m2 = await seedMatch(ds, championship.id, a!.id, b!.id);
        const arena1 = await seedArena(ds, 'Arena 1');
        const arena2 = await seedArena(ds, 'Arena 2');
        const userB = await createUser(ds, 'org-b', 'pw');
        tokenB = await loginToken(app, 'org-b', 'pw');
        const day = new Date('2026-11-04T12:00:00Z');
        const championshipB = await ds
            .getRepository(Championship)
            .save(new Championship('Copa B', day, day, userB.id));
        const [ra, rb] = await Promise.all(
            ['Vênus', 'Júpiter'].map((name) =>
                seedRobot(ds, championshipB.id, { name }),
            ),
        );
        const mB = await seedMatch(ds, championshipB.id, ra!.id, rb!.id);
        const arenaB = await seedArena(ds, 'Arena B', userB.id);
        ids = {
            arena1: arena1.id,
            arena2: arena2.id,
            m1: m1.id,
            m2: m2.id,
            arenaB: arenaB.id,
            mB: mB.id,
        };
    });

    afterAll(async () => {
        await app.close();
    });

    const http = () => request(app.getHttpServer());
    const auth = () => ({ Authorization: `Bearer ${token}` });
    const authB = () => ({ Authorization: `Bearer ${tokenB}` });

    async function currentMatchOf(arenaId: string): Promise<string | null> {
        const arena = await ds
            .getRepository(Arena)
            .findOneByOrFail({ id: arenaId });
        return arena.currentMatchId;
    }

    async function setState(matchId: string, state: MatchState) {
        await ds.query(`UPDATE "matches" SET "state" = $1 WHERE "id" = $2`, [
            state,
            matchId,
        ]);
    }

    it('selects a scheduled match', async () => {
        const response = await http()
            .put(`/arenas/${ids.arena1}/current-match`)
            .set(auth())
            .send({ matchId: ids.m1 })
            .expect(200);

        expect(response.body).toEqual({
            id: ids.arena1,
            name: 'Arena 1',
            deviceId: 'Arena 1-device',
            online: false,
            currentMatchId: ids.m1,
            currentMatch: {
                id: ids.m1,
                robotAName: 'Titã',
                robotBName: 'Marte',
            },
        });
        expect(await currentMatchOf(ids.arena1)).toBe(ids.m1);
    });

    it('selecting the current match again is idempotent', async () => {
        await arenas.setCurrentMatch(ids.arena1, ids.m1, ownerA);

        await http()
            .put(`/arenas/${ids.arena1}/current-match`)
            .set(auth())
            .send({ matchId: ids.m1 })
            .expect(200);

        expect(await currentMatchOf(ids.arena1)).toBe(ids.m1);
    });

    it('swaps to another scheduled match while the current one is scheduled', async () => {
        await arenas.setCurrentMatch(ids.arena1, ids.m1, ownerA);

        expect(await arenas.setCurrentMatch(ids.arena1, ids.m2, ownerA)).toBe(
            'done',
        );
        expect(await currentMatchOf(ids.arena1)).toBe(ids.m2);
    });

    it('rejects the swap with arena_match_started once the current match is ongoing', async () => {
        await arenas.setCurrentMatch(ids.arena1, ids.m1, ownerA);
        await setState(ids.m1, 'ongoing');

        const response = await http()
            .put(`/arenas/${ids.arena1}/current-match`)
            .set(auth())
            .send({ matchId: ids.m2 })
            .expect(409);

        expect(response.body.message).toBe('arena_match_started');
        expect(await currentMatchOf(ids.arena1)).toBe(ids.m1);
    });

    it('rejects a match already current on another arena with match_already_current', async () => {
        await arenas.setCurrentMatch(ids.arena1, ids.m1, ownerA);

        const response = await http()
            .put(`/arenas/${ids.arena2}/current-match`)
            .set(auth())
            .send({ matchId: ids.m1 })
            .expect(409);

        expect(response.body.message).toBe('match_already_current');
        expect(await currentMatchOf(ids.arena2)).toBeNull();
    });

    it.each(['ongoing', 'paused', 'finished'] as const)(
        'rejects a %s match with match_not_scheduled',
        async (state) => {
            await setState(ids.m1, state);

            expect(
                await arenas.setCurrentMatch(ids.arena1, ids.m1, ownerA),
            ).toBe('match_not_scheduled');
            expect(await currentMatchOf(ids.arena1)).toBeNull();
        },
    );

    it('answers 404 arena_not_found for an unknown arena', async () => {
        const response = await http()
            .put(`/arenas/${UNKNOWN_ID}/current-match`)
            .set(auth())
            .send({ matchId: ids.m1 })
            .expect(404);

        expect(response.body.message).toBe('arena_not_found');
    });

    it('answers 404 match_not_found for an unknown match', async () => {
        const response = await http()
            .put(`/arenas/${ids.arena1}/current-match`)
            .set(auth())
            .send({ matchId: UNKNOWN_ID })
            .expect(404);

        expect(response.body.message).toBe('match_not_found');
    });

    it('answers 404 match_not_found for a soft-deleted match', async () => {
        await ds.query(
            `UPDATE "matches" SET "deleted_at" = now() WHERE "id" = $1`,
            [ids.m1],
        );

        const response = await http()
            .put(`/arenas/${ids.arena1}/current-match`)
            .set(auth())
            .send({ matchId: ids.m1 })
            .expect(404);

        expect(response.body.message).toBe('match_not_found');
    });

    it('lets exactly one of two arenas take the same match at once', async () => {
        const results = await Promise.all([
            arenas.setCurrentMatch(ids.arena1, ids.m1, ownerA),
            arenas.setCurrentMatch(ids.arena2, ids.m1, ownerA),
        ]);

        expect([...results].sort()).toEqual(['done', 'match_already_current']);
        const [{ count }]: { count: string }[] = await ds.query(
            `SELECT count(*) FROM "arenas" WHERE "current_match_id" = $1`,
            [ids.m1],
        );
        expect(count).toBe('1');
    });

    it('clears the arena pointer when its current match is deleted', async () => {
        await arenas.setCurrentMatch(ids.arena1, ids.m1, ownerA);

        await http().delete(`/matches/${ids.m1}`).set(auth()).expect(204);

        expect(await currentMatchOf(ids.arena1)).toBeNull();
    });

    it('clears the arena pointer when the championship of its current match is deleted', async () => {
        await arenas.setCurrentMatch(ids.arena1, ids.m1, ownerA);
        const [{ championship_id }]: { championship_id: string }[] =
            await ds.query(
                `SELECT "championship_id" FROM "matches" WHERE "id" = $1`,
                [ids.m1],
            );

        await http()
            .delete(`/championships/${championship_id}`)
            .set(auth())
            .expect(204);

        expect(await currentMatchOf(ids.arena1)).toBeNull();
    });

    it('keeps the arena pointer when the delete is refused', async () => {
        await arenas.setCurrentMatch(ids.arena1, ids.m1, ownerA);
        await setState(ids.m1, 'ongoing');

        await http().delete(`/matches/${ids.m1}`).set(auth()).expect(409);

        expect(await currentMatchOf(ids.arena1)).toBe(ids.m1);
    });

    it('rejects GET /arenas and PUT without a token with 401', async () => {
        await http().get('/arenas').expect(401);
        await http()
            .put(`/arenas/${ids.arena1}/current-match`)
            .send({ matchId: ids.m1 })
            .expect(401);
    });

    it("lists only the caller's arenas, with device id and current match", async () => {
        await arenas.setCurrentMatch(ids.arena1, ids.m1, ownerA);

        const response = await http().get('/arenas').set(auth()).expect(200);

        expect(response.body).toEqual([
            {
                id: ids.arena1,
                name: 'Arena 1',
                deviceId: 'Arena 1-device',
                online: false,
                currentMatchId: ids.m1,
                currentMatch: {
                    id: ids.m1,
                    robotAName: 'Titã',
                    robotBName: 'Marte',
                },
            },
            {
                id: ids.arena2,
                name: 'Arena 2',
                deviceId: 'Arena 2-device',
                online: false,
                currentMatchId: null,
                currentMatch: null,
            },
        ]);
        const json = JSON.stringify(response.body);
        expect(json).not.toContain('tokenHash');
        expect(json).not.toContain('token_hash');
        expect(json).not.toContain(ids.arenaB);
    });

    it('answers 404 arena_not_found when another account selects on this arena', async () => {
        const response = await http()
            .put(`/arenas/${ids.arena1}/current-match`)
            .set(authB())
            .send({ matchId: ids.mB })
            .expect(404);

        expect(response.body.message).toBe('arena_not_found');
        expect(await currentMatchOf(ids.arena1)).toBeNull();
    });

    it.each(['scheduled', 'ongoing'] as const)(
        "answers 404 match_not_found for another account's %s match",
        async (state) => {
            await setState(ids.mB, state);

            const response = await http()
                .put(`/arenas/${ids.arena1}/current-match`)
                .set(auth())
                .send({ matchId: ids.mB })
                .expect(404);

            expect(response.body.message).toBe('match_not_found');
            expect(await currentMatchOf(ids.arena1)).toBeNull();
        },
    );

    describe('create and rename', () => {
        const create = (name: string, headers = auth()) =>
            http().post('/arenas').set(headers).send({ name });

        async function rowOf(arenaId: string) {
            return ds.getRepository(Arena).findOneByOrFail({ id: arenaId });
        }

        it('creates an arena and returns its credentials once', async () => {
            const response = await create('Arena da garagem').expect(201);

            const { arena, credentials } = response.body;
            expect(arena.deviceId).toBe(credentials.deviceId);
            expect(credentials.deviceId).toMatch(
                /^arena-da-garagem-[0-9a-f]{4}$/,
            );
            expect(credentials.token).toMatch(/^[0-9a-f]{64}$/);
            expect(credentials).toHaveProperty('serverUrl');
            expect(arena).toMatchObject({
                name: 'Arena da garagem',
                online: false,
                currentMatchId: null,
                currentMatch: null,
            });
            const row = await rowOf(arena.id);
            expect(row.ownerUserId).toBe(ownerA);
            expect(await bcrypt.compare(credentials.token, row.tokenHash)).toBe(
                true,
            );
            expect(JSON.stringify(arena)).not.toContain('tokenHash');
        });

        it('rejects a name differing only in case with arena_name_taken', async () => {
            await create('Minha Arena').expect(201);

            const response = await create('minha arena').expect(409);

            expect(response.body.message).toBe('arena_name_taken');
        });

        it("accepts the name of another account's arena", async () => {
            await create('Arena B').expect(201);
        });

        it('accepts the name of a soft-deleted arena of the same account', async () => {
            const { body } = await create('Arena velha').expect(201);
            await ds.query(
                `UPDATE "arenas" SET "deleted_at" = now() WHERE "id" = $1`,
                [body.arena.id],
            );

            await create('Arena velha').expect(201);
        });

        it('renames and keeps the device id', async () => {
            const before = await rowOf(ids.arena1);

            const response = await http()
                .patch(`/arenas/${ids.arena1}`)
                .set(auth())
                .send({ name: '  Ringue   novo ' })
                .expect(200);

            expect(response.body).toMatchObject({
                id: ids.arena1,
                name: 'Ringue novo',
                deviceId: before.deviceId,
            });
            const after = await rowOf(ids.arena1);
            expect(after.name).toBe('Ringue novo');
            expect(after.deviceId).toBe(before.deviceId);
        });

        it('accepts renaming an arena to a case change of its own name', async () => {
            const response = await http()
                .patch(`/arenas/${ids.arena1}`)
                .set(auth())
                .send({ name: 'ARENA 1' })
                .expect(200);

            expect(response.body.name).toBe('ARENA 1');
        });

        it('rejects renaming to the name of another live arena with arena_name_taken', async () => {
            const response = await http()
                .patch(`/arenas/${ids.arena1}`)
                .set(auth())
                .send({ name: 'arena 2' })
                .expect(409);

            expect(response.body.message).toBe('arena_name_taken');
            expect((await rowOf(ids.arena1)).name).toBe('Arena 1');
        });

        it("answers 404 arena_not_found for another account's arena and changes nothing", async () => {
            const response = await http()
                .patch(`/arenas/${ids.arena1}`)
                .set(authB())
                .send({ name: 'Roubada' })
                .expect(404);

            expect(response.body.message).toBe('arena_not_found');
            expect((await rowOf(ids.arena1)).name).toBe('Arena 1');
        });

        it('answers 404 arena_not_found for a soft-deleted arena', async () => {
            await ds.query(
                `UPDATE "arenas" SET "deleted_at" = now() WHERE "id" = $1`,
                [ids.arena1],
            );

            const response = await http()
                .patch(`/arenas/${ids.arena1}`)
                .set(auth())
                .send({ name: 'Nova' })
                .expect(404);

            expect(response.body.message).toBe('arena_not_found');
        });

        it('rejects a 41-character name with 400', async () => {
            await create('a'.repeat(41)).expect(400);
            await http()
                .patch(`/arenas/${ids.arena1}`)
                .set(auth())
                .send({ name: 'a'.repeat(41) })
                .expect(400);
        });

        it('rejects POST and PATCH without a token with 401', async () => {
            await http().post('/arenas').send({ name: 'X' }).expect(401);
            await http()
                .patch(`/arenas/${ids.arena1}`)
                .send({ name: 'X' })
                .expect(401);
        });
    });
});
