import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Match } from './entities/match.entity.js';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';
import { Arena } from '../arenas/entities/arena.entity.js';
import { Championship } from '../championships/entities/championship.entity.js';
import { Robot } from '../robots/entities/robot.entity.js';

/** Builds the write from the robots as read under the lock (null when gone); throws to abort */
export type BuildFromRobots<T> = (
    robotA: Robot | null,
    robotB: Robot | null,
) => T | Promise<T>;

/** Thrown inside softDeleteIf's transaction to roll back the arena pointer clear */
const NOTHING_DELETED = Symbol('nothing_deleted');

/**
 * Lock order shared by every write that spans these tables, so two of them can't deadlock:
 * championship, then robots (by id), then the match. Arenas come before the match too.
 */
@Injectable()
export class MatchesRepository {
    constructor(
        @InjectRepository(Match)
        private readonly repository: Repository<Match>,
    ) {}

    /**
     * Inserts the match from `build` while the championship and both robots are locked
     * FOR SHARE, so a concurrent robot change or championship delete waits for this insert
     * (or this insert waits for it, and `build` sees the result). Null when the championship is
     * gone.
     */
    createWithRobots(
        championshipId: string,
        robotIds: [string, string],
        build: BuildFromRobots<Match>,
    ): Promise<Match | null> {
        return this.repository.manager.transaction(async (manager) => {
            if (!(await this.lockChampionship(manager, championshipId))) {
                return null;
            }
            const [robotA, robotB] = await this.lockRobots(manager, robotIds);
            return manager.save(await build(robotA, robotB));
        });
    }

    /**
     * Applies the patch from `build` while the match is still live and `scheduled`, under the same
     * locks as createWithRobots. False when the match was deleted, left `scheduled` or lost its
     * championship.
     */
    updateScheduledWithRobots(
        id: string,
        championshipId: string,
        robotIds: [string, string],
        build: BuildFromRobots<QueryDeepPartialEntity<Match>>,
    ): Promise<boolean> {
        return this.repository.manager.transaction(async (manager) => {
            if (!(await this.lockChampionship(manager, championshipId))) {
                return false;
            }
            const [robotA, robotB] = await this.lockRobots(manager, robotIds);
            return this.conditionalUpdate(
                manager,
                id,
                { state: 'scheduled' },
                await build(robotA, robotB),
            );
        });
    }

    findAll(championshipId?: string): Promise<Match[]> {
        return this.repository.find({
            where: championshipId ? { championshipId } : {},
            // Robot names for the organizer list without one request per robot
            relations: { robotA: true, robotB: true },
            // Fights are ordered manually by creation; there is no bracket
            order: { createdAt: 'ASC' },
        });
    }

    /** With its robots, like findAll */
    findOne(id: string): Promise<Match | null> {
        return this.repository.findOne({
            where: { id },
            relations: { robotA: true, robotB: true },
        });
    }

    /**
     * Soft-deletes only while the live match still matches `expected`, and clears the pointer of
     * any arena whose current match it was, in one transaction. False when nothing matched (the
     * arenas are left as they were).
     *
     * Every arena row is locked first (arena before match, like ArenasRepository): an arena
     * selection holds its arena's lock until it commits, so none can point an arena at this
     * match between the pointer clear and the delete.
     */
    async softDeleteIf(
        id: string,
        expected: FindOptionsWhere<Match>,
    ): Promise<boolean> {
        try {
            await this.repository.manager.transaction(async (manager) => {
                // Read through the manager so this module doesn't depend on ArenasModule
                await manager.find(Arena, {
                    select: { id: true },
                    order: { id: 'ASC' },
                    lock: { mode: 'pessimistic_write' },
                });
                await manager.update(
                    Arena,
                    { currentMatchId: id },
                    { currentMatchId: null },
                );
                const result = await manager.softDelete(Match, {
                    ...expected,
                    id,
                    deletedAt: IsNull(),
                });
                if (result.affected !== 1) {
                    throw NOTHING_DELETED;
                }
            });
            return true;
        } catch (error) {
            if (error === NOTHING_DELETED) {
                return false;
            }
            throw error;
        }
    }

    private async lockChampionship(
        manager: EntityManager,
        id: string,
    ): Promise<boolean> {
        const championship = await manager.findOne(Championship, {
            where: { id },
            lock: { mode: 'pessimistic_read' },
        });
        return championship !== null;
    }

    /** The two live robots, locked FOR SHARE in id order, returned in the order asked */
    private async lockRobots(
        manager: EntityManager,
        [robotAId, robotBId]: [string, string],
    ): Promise<[Robot | null, Robot | null]> {
        const robots = await manager.find(Robot, {
            where: { id: In([robotAId, robotBId]) },
            order: { id: 'ASC' },
            lock: { mode: 'pessimistic_read' },
        });
        const byId = (id: string) =>
            robots.find((robot) => robot.id === id) ?? null;
        return [byId(robotAId), byId(robotBId)];
    }

    /**
     * Writes only while the live match still matches `expected`, in one UPDATE, so a check
     * done earlier can't go stale before the write. False when nothing matched.
     */
    private async conditionalUpdate(
        manager: EntityManager,
        id: string,
        expected: FindOptionsWhere<Match>,
        patch: QueryDeepPartialEntity<Match>,
    ): Promise<boolean> {
        // update() doesn't skip soft-deleted rows on its own
        const result = await manager.update(
            Match,
            { ...expected, id, deletedAt: IsNull() },
            patch,
        );
        return result.affected === 1;
    }
}
