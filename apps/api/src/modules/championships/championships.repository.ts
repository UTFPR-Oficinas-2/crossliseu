import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Championship } from './entities/championship.entity.js';
import { In, Repository } from 'typeorm';
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

            const matches = await manager.find(Match, {
                where: { championshipId: id },
                lock: { mode: 'pessimistic_write' },
            });
            if (matches.some((match) => LIVE_STATES.includes(match.state))) {
                return 'has_live_match';
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
