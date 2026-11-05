import type { Relation } from 'typeorm';
import { Check, Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';
import { Championship } from '../../championships/entities/championship.entity.js';
import { Robot } from '../../robots/entities/robot.entity.js';
import { User } from '../../users/entities/user.entity.js';
import {
    WEIGHT_CLASS_CHECK,
    type WeightClass,
} from '../../robots/weight-class.js';

export type MatchState = 'scheduled' | 'ongoing' | 'paused' | 'finished';
export type MatchEndReason = 'time_out' | 'manual' | 'surrender';

// TypeORM compares CHECKs by name only: changing these values needs a hand-written migration
@Check('CHK_matches_weight_class', WEIGHT_CLASS_CHECK)
@Check(
    'CHK_matches_state',
    `"state" IN ('scheduled', 'ongoing', 'paused', 'finished')`,
)
@Check(
    'CHK_matches_end_reason',
    `"end_reason" IS NULL OR "end_reason" IN ('time_out', 'manual', 'surrender')`,
)
@Entity('matches')
export class Match extends BaseEntity {
    // TypeORM calls the constructor without arguments when hydrating rows
    constructor(
        weightClass?: WeightClass,
        championshipId?: string,
        robotAId?: string,
        robotBId?: string,
        createdByUserId?: string,
        scheduledAt?: Date,
    ) {
        super();

        if (
            !weightClass ||
            !championshipId ||
            !robotAId ||
            !robotBId ||
            !createdByUserId ||
            !scheduledAt
        ) {
            return;
        }

        this.weightClass = weightClass;
        this.championshipId = championshipId;
        this.robotAId = robotAId;
        this.robotBId = robotBId;
        this.createdByUserId = createdByUserId;
        this.scheduledAt = scheduledAt;
        this.state = 'scheduled';
    }

    @Column({ name: 'weight_class', type: 'varchar', nullable: false })
    weightClass: WeightClass;

    @Column({ name: 'state', type: 'varchar', nullable: false })
    state: MatchState;

    @Column({ name: 'end_reason', type: 'varchar', nullable: true })
    endReason: MatchEndReason | null;

    @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: false })
    scheduledAt: Date;

    @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
    startedAt: Date | null;

    @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
    finishedAt: Date | null;

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

    @Column({ name: 'winner_robot_id', type: 'uuid', nullable: true })
    winnerRobotId: string | null;

    @ManyToOne(() => Robot, { nullable: true })
    @JoinColumn({ name: 'winner_robot_id' })
    winnerRobot?: Relation<Robot> | null;

    @Column({ name: 'created_by_user_id', type: 'uuid', nullable: false })
    createdByUserId: string;

    @ManyToOne(() => User, { nullable: false })
    @JoinColumn({ name: 'created_by_user_id' })
    createdBy?: Relation<User>;
}
