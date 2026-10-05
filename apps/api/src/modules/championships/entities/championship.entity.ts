import { Column, Entity, OneToMany } from 'typeorm';
import type { Relation } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';
import { Match } from '../../matches/entities/match.entity.js';
import { Robot } from '../../robots/entities/robot.entity.js';

export type ChampionshipStatus = 'ongoing' | 'scheduled' | 'closed';

@Entity('championships')
export class Championship extends BaseEntity {
    // TypeORM calls the constructor without arguments when hydrating rows
    constructor(name?: string, startDate?: Date, endDate?: Date) {
        super();

        if (!name || !startDate || !endDate) {
            return;
        }

        this.name = name;
        this.startDate = startDate;
        this.endDate = endDate;
        this.status = this.setInitialStatus(startDate, endDate);
    }

    private setInitialStatus(
        startDate: Date,
        endDate: Date,
    ): ChampionshipStatus {
        const getIsoSplit = (date: Date): string => {
            return date.toISOString().split('T')[0];
        };

        const startDateIso = getIsoSplit(startDate);
        const endDateIso = getIsoSplit(endDate);
        const todayIso = getIsoSplit(new Date());

        if (endDateIso < todayIso) {
            return 'closed';
        } else if (startDateIso > todayIso) {
            return 'scheduled';
        } else {
            return 'ongoing';
        }
    }

    @Column({ name: 'name', type: 'varchar', nullable: false })
    name: string;

    @Column({ name: 'start_date', type: 'timestamptz', nullable: false })
    startDate: Date;

    @Column({ name: 'end_date', type: 'timestamptz', nullable: false })
    endDate: Date;

    @Column({ name: 'status', type: 'varchar', nullable: false })
    status: ChampionshipStatus;

    @OneToMany(() => Match, (match) => match.championship)
    matches: Relation<Match[]>;

    @OneToMany(() => Robot, (robot) => robot.championship)
    robots: Relation<Robot[]>;
}
