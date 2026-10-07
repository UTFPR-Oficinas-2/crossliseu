import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';
import { Championship } from '../../championships/entities/championship.entity.js';
import { Robot } from '../../robots/entities/robot.entity.js';

export type MatchState = 'waiting' | 'running' | 'finished' | 'paused';

@Entity('matches')
export class Match extends BaseEntity {
    // TypeORM calls the constructor without arguments when hydrating rows
    constructor(
        weightClass?: string,
        championshipId?: string,
        robotAId?: string,
        robotBId?: string,
    ) {
        super();

        if (!weightClass || !championshipId || !robotAId || !robotBId) {
            return;
        }

        this.weightClass = weightClass;
        this.championshipId = championshipId;
        this.robotAId = robotAId;
        this.robotBId = robotBId;
        this.status = 'waiting';
    }

    @Column({ name: 'weight_class', type: 'varchar', nullable: false })
    weightClass: string;

    @Column({ name: 'state', type: 'varchar', nullable: false })
    status: MatchState;

    @Column({ name: 'championship_id', type: 'uuid', nullable: false })
    championshipId: string;

    @ManyToOne(() => Championship, { nullable: false })
    @JoinColumn({ name: 'championship_id' })
    championship?: Relation<Championship>;

    @Column({ name: 'robot_a_id', type: 'uuid', nullable: false })
    robotAId: string;

    @ManyToOne(() => Robot, { nullable: false })
    @JoinColumn({ name: 'robot_a_id' })
    robotA?: Relation<Robot>;

    @Column({ name: 'robot_b_id', type: 'uuid', nullable: false })
    robotBId: string;

    @ManyToOne(() => Robot, { nullable: false })
    @JoinColumn({ name: 'robot_b_id' })
    robotB?: Relation<Robot>;
}
