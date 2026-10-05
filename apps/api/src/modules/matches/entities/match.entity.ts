import { Column, Entity, ManyToOne } from 'typeorm';
import type { Relation } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';
import { Championship } from '../../championships/entities/championship.entity.js';

@Entity('matches')
export class Match extends BaseEntity {
    constructor(weightClass: string, scheduledDate: Date | null) {
        super();

        this.weightClass = weightClass;
        this.scheduledDate = scheduledDate ? scheduledDate : null;
    }

    @Column({ name: 'weight_class', type: 'varchar', nullable: false })
    weightClass: string;

    @ManyToOne(() => Championship, (championship) => championship.matches)
    championship: Relation<Championship>;

    @Column({ name: 'scheduled_date', type: 'timestamptz', nullable: true })
    scheduledDate?: Date | null;
}
