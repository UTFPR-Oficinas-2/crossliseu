import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Championship } from './entities/championship.entity.js';
import { In, Repository } from 'typeorm';
import { Arena } from '../arenas/entities/arena.entity.js';
import type { MatchState } from '../matches/entities/match.entity.js';
import { Match } from '../matches/entities/match.entity.js';
import { Robot } from '../robots/entities/robot.entity.js';

export interface ChampionshipCounts {
    robotCount: number;
    fightsTotal: number;
    fightsDone: number;
}

interface ChampionshipCountsRow {
    id: string;
    robotCount: string;
    fightsTotal: string;
    fightsDone: string;
}

@Injectable()
export class ChampionshipsRepository {
    constructor(
        @InjectRepository(Championship)
        private readonly repository: Repository<Championship>,
    ) {}

    create(championship: Championship): Promise<Championship> {
        return this.repository.save(championship);
    }

    findAll(): Promise<Championship[]> {
        return this.repository.find();
    }

    findOne(id: string): Promise<Championship | null> {
        return this.repository.findOneBy({ id });
    }

    /** The live championships created by this user */
    findByOwner(ownerUserId: string): Promise<Championship[]> {
        return this.repository.findBy({ createdByUserId: ownerUserId });
    }

    /** The live championship with this id, only when this user created it */
    findOneOwned(
        id: string,
        ownerUserId: string,
    ): Promise<Championship | null> {
        return this.repository.findOneBy({ id, createdByUserId: ownerUserId });
    }

    /** Robots, matches and finished matches per championship id (soft-deleted rows excluded) */
    async countRobotsAndMatches(
        ids: string[],
    ): Promise<Map<string, ChampionshipCounts>> {
        if (ids.length === 0) {
            return new Map();
        }

        const rows = await this.repository
            .createQueryBuilder('championship')
            .select('championship.id', 'id')
            .addSelect('COUNT(DISTINCT robot.id)', 'robotCount')
            .addSelect('COUNT(DISTINCT match.id)', 'fightsTotal')
            .addSelect(
                'COUNT(DISTINCT match.id) FILTER (WHERE match.state = :finished)',
                'fightsDone',
            )
            // TypeORM adds `deletedAt IS NULL` to entity joins, keeping soft-deleted rows out
            .leftJoin(Robot, 'robot', 'robot.championshipId = championship.id')
            .leftJoin(Match, 'match', 'match.championshipId = championship.id')
            .where({ id: In(ids) })
            .setParameter('finished', 'finished')
            .groupBy('championship.id')
            .getRawMany<ChampionshipCountsRow>();

        // Postgres returns COUNT as bigint, which the driver hands back as a string
        return new Map(
            rows.map((row) => [
                row.id,
                {
                    robotCount: Number(row.robotCount),
                    fightsTotal: Number(row.fightsTotal),
                    fightsDone: Number(row.fightsDone),
                },
            ]),
        );
    }

    update(id: string, partialChampionship: Partial<Championship>) {
        return this.repository.update({ id }, partialChampionship);
    }

    /**
     * Soft-deletes the championship with its robots and matches, in one transaction. Refuses
     * while a match is being fought. Locks the championship FOR UPDATE, then its matches, the
     * same order as the robot and match writes (which lock it FOR SHARE), so an insert into this
     * championship either commits first and is deleted here, or waits and finds it gone.
     * Every arena is locked between the championship and the matches (arena before match, like
     * ArenasRepository), and arenas pointing at a deleted match lose that pointer.
     */
    removeCascade(
        id: string,
    ): Promise<'done' | 'not_found' | 'has_live_match'> {
        return this.repository.manager.transaction(async (manager) => {
            const championship = await manager.findOne(Championship, {
                where: { id },
                lock: { mode: 'pessimistic_write' },
            });
            if (!championship) {
                return 'not_found';
            }

            await manager.find(Arena, {
                select: { id: true },
                order: { id: 'ASC' },
                lock: { mode: 'pessimistic_write' },
            });

            const matches = await manager.find(Match, {
                where: { championshipId: id },
                lock: { mode: 'pessimistic_write' },
            });
            if (matches.some((match) => LIVE_STATES.includes(match.state))) {
                return 'has_live_match';
            }

            if (matches.length > 0) {
                await manager.update(
                    Arena,
                    { currentMatchId: In(matches.map((match) => match.id)) },
                    { currentMatchId: null },
                );
            }
            await manager.softDelete(Match, { championshipId: id });
            await manager.softDelete(Robot, { championshipId: id });
            await manager.softDelete(Championship, { id });
            return 'done';
        });
    }
}

/** A match in one of these states is being fought and keeps its championship */
const LIVE_STATES: MatchState[] = ['ongoing', 'paused'];
