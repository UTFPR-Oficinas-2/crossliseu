import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';
import { Championship } from '../../championships/entities/championship.entity.js';
import { Robot } from '../../robots/entities/robot.entity.js';

export type MatchState = 'waiting' | 'running' | 'finished' | 'paused';

@Entity('matches')
export class Match extends BaseEntity {
    constructor(weightClass: string, robotA: Robot, robotB: Robot) {
        super();

        this.weightClass = weightClass;
        this.robotA = robotA;
        this.robotB = robotB;
        this.status = 'waiting';
    }

    @Column({ name: 'weight_class', type: 'varchar', nullable: false })
    weightClass: string;

    @Column({ name: 'state', type: 'varchar', nullable: false })
    status: MatchState;

    @ManyToOne(() => Robot, { nullable: false })
    @JoinColumn({ name: 'robot_a_id' })
    robotA: Relation<Robot>;

    @ManyToOne(() => Robot, { nullable: false })
    @JoinColumn({ name: 'robot_b_id' })
    robotB: Relation<Robot>;

    @ManyToOne(() => Championship, (championship) => championship.matches)
    championship: Relation<Championship>;
}
