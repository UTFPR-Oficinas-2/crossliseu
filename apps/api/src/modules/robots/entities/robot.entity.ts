import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';
import { Championship } from '../../championships/entities/championship.entity.js';

@Entity('robots')
export class Robot extends BaseEntity {
    // TypeORM calls the constructor without arguments when hydrating rows
    constructor(
        name?: string,
        weightClass?: string,
        team?: string,
        championshipId?: string,
    ) {
        super();

        if (!name || !weightClass || !team || !championshipId) {
            return;
        }

        this.name = name;
        this.weightClass = weightClass;
        this.team = team;
        this.championshipId = championshipId;
    }

    @Column({ name: 'name', type: 'varchar', nullable: false })
    name: string;

    @Column({ name: 'weight_class', type: 'varchar', nullable: false })
    weightClass: string;

    @Column({ name: 'team', type: 'varchar', nullable: false })
    team: string;

    @Column({ name: 'championship_id', type: 'uuid', nullable: false })
    championshipId: string;

    @ManyToOne(() => Championship, (championship) => championship.robots)
    @JoinColumn({ name: 'championship_id' })
    championship?: Relation<Championship>;
}
