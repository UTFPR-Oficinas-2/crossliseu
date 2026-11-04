import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Robot } from './entities/robot.entity.js';
import { EntityManager, Raw, Repository } from 'typeorm';
import { Match } from '../matches/entities/match.entity.js';
import { Championship } from '../championships/entities/championship.entity.js';

/** Outcome of a robot write that may be refused because the robot is in a match */
export type RobotWriteResult = 'done' | 'not_found' | 'has_matches';

@Injectable()
export class RobotsRepository {
    constructor(
        @InjectRepository(Robot)
        private readonly repository: Repository<Robot>,
    ) {}

    /**
     * Inserts the robot while its championship is locked FOR SHARE, so a championship delete
     * (which locks it FOR UPDATE) can't miss it. Null when the championship is gone.
     */
    create(robot: Robot): Promise<Robot | null> {
        return this.repository.manager.transaction(async (manager) => {
            const championship = await manager.findOne(Championship, {
                where: { id: robot.championshipId },
                lock: { mode: 'pessimistic_read' },
            });
            return championship ? manager.save(robot) : null;
        });
    }

    findAll(championshipId?: string): Promise<Robot[]> {
        return this.repository.find({
            where: championshipId ? { championshipId } : {},
            // Registration order keeps the organizer list stable
            order: { createdAt: 'ASC' },
        });
    }

    findOne(id: string): Promise<Robot | null> {
        return this.repository.findOneBy({ id });
    }

    /** The live robot in the championship with this name, ignoring case */
    findByName(championshipId: string, name: string): Promise<Robot | null> {
        return this.repository.findOne({
            where: {
                championshipId,
                name: Raw((alias) => `LOWER(${alias}) = LOWER(:name)`, {
                    name,
                }),
            },
        });
    }

    /**
     * Updates the live robot. With `requireNoMatches`, refuses when a live match uses it; the
     * check and the write share one transaction holding the robot's row lock, and match writes
     * lock the robot too (MatchesRepository), so a match can't appear in between.
     */
    update(
        id: string,
        patch: Partial<Robot>,
        opts: { requireNoMatches: boolean },
    ): Promise<RobotWriteResult> {
        return this.writeLocked(id, opts.requireNoMatches, (manager) =>
            manager.update(Robot, { id }, patch),
        );
    }

    /** Soft-deletes the live robot unless a live match uses it (same locking as update) */
    remove(id: string): Promise<RobotWriteResult> {
        return this.writeLocked(id, true, (manager) =>
            manager.softDelete(Robot, { id }),
        );
    }

    private writeLocked(
        id: string,
        requireNoMatches: boolean,
        write: (manager: EntityManager) => Promise<unknown>,
    ): Promise<RobotWriteResult> {
        return this.repository.manager.transaction(async (manager) => {
            // FOR UPDATE waits for match writes holding FOR SHARE on this robot to commit
            const robot = await manager.findOne(Robot, {
                where: { id },
                lock: { mode: 'pessimistic_write' },
            });
            if (!robot) {
                return 'not_found';
            }

            // A new statement, so READ COMMITTED sees matches committed while we waited. Read
            // through the entity manager, so RobotsModule doesn't depend on MatchesModule
            // (same approach as ChampionshipsRepository.countRobotsAndMatches)
            if (
                requireNoMatches &&
                (await manager.exists(Match, {
                    where: [{ robotAId: id }, { robotBId: id }],
                }))
            ) {
                return 'has_matches';
            }

            await write(manager);
            return 'done';
        });
    }
}
