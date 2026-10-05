import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Championship } from './entities/championship.entity.js';
import { In, Repository } from 'typeorm';

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
                'COUNT(DISTINCT match.id) FILTER (WHERE match.status = :finished)',
                'fightsDone',
            )
            .leftJoin('championship.robots', 'robot')
            .leftJoin('championship.matches', 'match')
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

    remove(id: string) {
        return this.repository.softDelete({ id });
    }
}
