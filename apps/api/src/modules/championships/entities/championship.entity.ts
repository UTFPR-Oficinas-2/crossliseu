import { Column, Entity, OneToMany } from 'typeorm';
import type { Relation } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';
import { Match } from '../../matches/entities/match.entity.js';
import { Robot } from '../../robots/entities/robot.entity.js';

export type ChampionshipStatus = 'ongoing' | 'scheduled' | 'closed';

@Entity('championships')
export class Championship extends BaseEntity {
    constructor(name: string, date: Date) {
        super();

        this.name = name;
        this.date = date;
        this.status = this.setInitialStatus(date);
    }

    private setInitialStatus(date: Date): ChampionshipStatus {
        const getIsoSplit = (date: Date): string => {
            return date.toISOString().split('T')[0];
        };

        const championshipDateIso = getIsoSplit(date);
        const todayIso = getIsoSplit(new Date());

        if (championshipDateIso < todayIso) {
            return 'closed';
        } else if (championshipDateIso > todayIso) {
            return 'scheduled';
        } else {
            return 'ongoing';
        }
    }

    @Column({ name: 'name', type: 'varchar', nullable: false })
    name: string;

    @Column({ name: 'date', type: 'timestamptz', nullable: true })
    date?: Date | null;

    @Column({ name: 'status', type: 'varchar', nullable: false })
    status: ChampionshipStatus;

    @OneToMany(() => Match, (match) => match.championship)
    matches: Relation<Match[]>;

    @OneToMany(() => Robot, (robot) => robot.championship)
    robots: Relation<Robot[]>;
}
