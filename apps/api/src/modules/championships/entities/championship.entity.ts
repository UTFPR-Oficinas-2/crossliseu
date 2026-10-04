import { Column, Entity, OneToMany } from 'typeorm';
import type { Relation } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';
import { Match } from '../../matches/entities/match.entity.js';

@Entity('championships')
export class Championship extends BaseEntity {
    constructor(name: string, scheduledDate: Date | null) {
        super();

        this.name = name;
        this.scheduledDate = scheduledDate ? scheduledDate : null;
    }

    @Column({ name: 'name', type: 'varchar', nullable: false })
    name: string;

    @Column({ name: 'scheduled_date', type: 'timestamptz', nullable: true })
    scheduledDate?: Date | null;

    @OneToMany(() => Match, (match) => match.championship)
    matches: Relation<Match[]>;
}
