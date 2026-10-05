import type { Relation } from 'typeorm';
import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';
import { Championship } from '../../championships/entities/championship.entity.js';

export type MatchState = 'waiting' | 'running' | 'finished' | 'paused';

@Entity('matches')
export class Match extends BaseEntity {
    constructor(weightClass: string, startDate: Date | null) {
        super();

        this.weightClass = weightClass;
        this.startDate = startDate ? startDate : null;
        this.status = 'waiting';
    }

    @Column({ name: 'weight_class', type: 'varchar', nullable: false })
    weightClass: string;

    @Column({ name: 'start_date', type: 'timestamptz', nullable: true })
    startDate?: Date | null;

    @Column({ name: 'state', type: 'varchar', nullable: false })
    status: MatchState;

    @ManyToOne(() => Championship, (championship) => championship.matches)
    championship: Relation<Championship>;
}
