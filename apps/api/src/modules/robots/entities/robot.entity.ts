import type { Relation } from 'typeorm';
import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';
import { Championship } from '../../championships/entities/championship.entity.js';

@Entity('robots')
export class Robot extends BaseEntity {
    constructor(name: string) {
        super();

        this.name = name;
    }

    @Column({ name: 'name', type: 'varchar', nullable: false })
    name: string;

    @ManyToOne(() => Championship, (championship) => championship.robots)
    championship: Relation<Championship>;
}
