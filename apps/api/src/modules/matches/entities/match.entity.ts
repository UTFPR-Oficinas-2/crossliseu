import type { Relation } from 'typeorm';
import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';
import { Championship } from '../../championships/entities/championship.entity.js';

@Entity('matches')
export class Match extends BaseEntity {
    constructor(weightClass: string, date: Date | null) {
        super();

        this.weightClass = weightClass;
        this.date = date ? date : null;
    }

    @Column({ name: 'weight_class', type: 'varchar', nullable: false })
    weightClass: string;

    @Column({ name: 'date', type: 'timestamptz', nullable: true })
    date?: Date | null;

    @ManyToOne(() => Championship, (championship) => championship.matches)
    championship: Relation<Championship>;
}
