import type { Relation } from 'typeorm';
import { Check, Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';
import { Arena } from '../../arenas/entities/arena.entity.js';
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
@Check('CHK_matches_result', `NOT ("draw" AND "winner_robot_id" IS NOT NULL)`)
@Unique('UQ_matches_referee_token', ['refereeToken'])
@Entity('matches')
export class Match extends BaseEntity {
    // TypeORM calls the constructor without arguments when hydrating rows
    constructor(
        weightClass?: WeightClass,
        championshipId?: string,
        robotAId?: string,
        robotBId?: string,
        createdByUserId?: string,
    ) {
        super();

        if (
            !weightClass ||
            !championshipId ||
            !robotAId ||
            !robotBId ||
            !createdByUserId
        ) {
            return;
        }

        this.weightClass = weightClass;
        this.championshipId = championshipId;
        this.robotAId = robotAId;
        this.robotBId = robotBId;
        this.createdByUserId = createdByUserId;
        this.state = 'scheduled';
    }

    @Column({ name: 'weight_class', type: 'varchar', nullable: false })
    weightClass: WeightClass;

    @Column({ name: 'state', type: 'varchar', nullable: false })
    state: MatchState;

    @Column({ name: 'end_reason', type: 'varchar', nullable: true })
    endReason: MatchEndReason | null;

    /**
     * When the fight started: the `started` event's time, `null` before Start. Not a column;
     * MatchesService fills it on the way out.
     */
    startedAt?: Date | null;

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

    /** The confirmed winner, written when the operator closes the fight (#50); null until then and on a draw */
    @Column({ name: 'winner_robot_id', type: 'uuid', nullable: true })
    winnerRobotId: string | null;

    @ManyToOne(() => Robot, { nullable: true })
    @JoinColumn({ name: 'winner_robot_id' })
    winnerRobot?: Relation<Robot> | null;

    /** True only for a draw the operator confirmed at close; never together with a winner */
    @Column({ name: 'draw', type: 'boolean', nullable: false, default: false })
    draw: boolean;

    /** The robot that gave up, set only when `endReason` is `surrender` */
    @Column({ name: 'surrendered_robot_id', type: 'uuid', nullable: true })
    surrenderedRobotId: string | null;

    @ManyToOne(() => Robot, { nullable: true })
    @JoinColumn({ name: 'surrendered_robot_id' })
    surrenderedRobot?: Relation<Robot> | null;

    // Arena the match was played on; written at Start, not by any DTO
    @Column({ name: 'arena_id', type: 'uuid', nullable: true })
    arenaId: string | null;

    @ManyToOne(() => Arena, { nullable: true })
    @JoinColumn({ name: 'arena_id' })
    arena?: Relation<Arena> | null;

    /**
     * Shared by the match's referees to join; created on first request, never rotated (#18).
     * Not selected by default: GET /matches is public and must never show it.
     */
    @Column({
        name: 'referee_token',
        type: 'varchar',
        nullable: true,
        select: false,
    })
    refereeToken: string | null;

    @Column({ name: 'created_by_user_id', type: 'uuid', nullable: false })
    createdByUserId: string;

    @ManyToOne(() => User, { nullable: false })
    @JoinColumn({ name: 'created_by_user_id' })
    createdBy?: Relation<User>;
}
