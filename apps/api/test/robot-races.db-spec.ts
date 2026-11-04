import { BadRequestException, ConflictException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { Match } from '../src/modules/matches/entities/match.entity.js';
import { MatchesRepository } from '../src/modules/matches/matches.repository.js';
import { MatchesService } from '../src/modules/matches/matches.service.js';
import { RobotsService } from '../src/modules/robots/robots.service.js';
import {
    createTestApp,
    dataSourceOf,
    deferred,
    isPendingAfter,
    resetDatabase,
    seedChampionship,
    seedCreatorId,
    seedRobot,
} from './helpers.js';

describe('robot writes racing match writes', () => {
    let app: INestApplication;
    let ds: DataSource;
    let championshipId: string;
    let robotA: string;
    let robotB: string;
    let creatorId: string;

    beforeAll(async () => {
        app = await createTestApp();
        ds = dataSourceOf(app);
    });

    beforeEach(async () => {
        await resetDatabase(ds);
        championshipId = (await seedChampionship(ds)).id;
        robotA = (await seedRobot(ds, championshipId, { name: 'Titã' })).id;
        robotB = (await seedRobot(ds, championshipId, { name: 'Marte' })).id;
        creatorId = await seedCreatorId(ds);
    });

    afterAll(async () => {
        await app.close();
    });

    /** Starts a match insert and holds its transaction open, robots locked, until released */
    function heldMatchCreate() {
        const gate = deferred();
        const created = app
            .get(MatchesRepository)
            .createWithRobots(championshipId, [robotA, robotB], async () => {
                await gate.promise;
                return new Match(
                    'lightweight',
                    championshipId,
                    robotA,
                    robotB,
                    creatorId,
                    new Date('2026-11-04T13:00:00Z'),
                );
            });
        return { created, release: () => gate.resolve() };
    }

    it('makes a weight class change wait for a match being created, then refuse it', async () => {
        const { created, release } = heldMatchCreate();
        // Let the create take its locks first
        await new Promise((r) => setTimeout(r, 100));

        const update = app
            .get(RobotsService)
            .update(robotA, { weightClass: 'featherweight' });
        const updateResult = update.catch((e: unknown) => e);

        expect(await isPendingAfter(update, 200)).toBe(true);
        release();

        await expect(created).resolves.toBeInstanceOf(Match);
        expect(await updateResult).toEqual(
            new ConflictException('robot_has_matches'),
        );
    });

    it('makes a robot delete wait for a match being created, then refuse it', async () => {
        const { created, release } = heldMatchCreate();
        await new Promise((r) => setTimeout(r, 100));

        const remove = app.get(RobotsService).remove(robotB);
        const removeResult = remove.catch((e: unknown) => e);

        expect(await isPendingAfter(remove, 200)).toBe(true);
        release();

        await created;
        expect(await removeResult).toEqual(
            new ConflictException('robot_has_matches'),
        );
    });

    it('makes a match create wait for a weight class change, then see it', async () => {
        const queryRunner = ds.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            await queryRunner.query(
                `SELECT 1 FROM "robots" WHERE "id" = $1 FOR UPDATE`,
                [robotA],
            );
            await queryRunner.query(
                `UPDATE "robots" SET "weight_class" = 'featherweight' WHERE "id" = $1`,
                [robotA],
            );

            const create = app.get(MatchesService).create(
                {
                    championshipId,
                    robotAId: robotA,
                    robotBId: robotB,
                    scheduledAt: new Date('2026-11-04T13:00:00Z'),
                },
                creatorId,
            );
            const createResult = create.catch((e: unknown) => e);

            expect(await isPendingAfter(create, 200)).toBe(true);
            await queryRunner.commitTransaction();

            expect(await createResult).toEqual(
                new BadRequestException('match_weight_class_mismatch'),
            );
        } finally {
            if (queryRunner.isTransactionActive) {
                await queryRunner.rollbackTransaction();
            }
            await queryRunner.release();
        }
    });
});
