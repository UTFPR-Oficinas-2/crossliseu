import type { Relation } from 'typeorm';
import {
    Check,
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Match } from './match.entity.js';
import { Robot } from '../../robots/entities/robot.entity.js';
import { User } from '../../users/entities/user.entity.js';

export const MATCH_EVENT_TYPES = [
    'started',
    'paused',
    'resumed',
    'finished',
    'closed',
    'scored',
] as const;
export type MatchEventType = (typeof MATCH_EVENT_TYPES)[number];

export type JudgeSeat = 1 | 2 | 3;
export type ScoreAction = 1 | -1;

// Partial unique index from the migration: (match_id, type) WHERE type IN ('started', 'finished',
// 'closed'), so a match has at most one of each. `synchronize: false` keeps migration:generate
// from dropping it.
@Index('UQ_match_events_once', { synchronize: false })
@Index('IDX_match_events_match_id_occurred_at', ['matchId', 'occurredAt'])
@Check(
    'CHK_match_events_type',
    `"type" IN ('started', 'paused', 'resumed', 'finished', 'closed', 'scored')`,
)
@Check(
    'CHK_match_events_score_fields',
    `("type" = 'scored' AND "robot_id" IS NOT NULL AND "judge_seat" IS NOT NULL AND "action" IS NOT NULL) OR ("type" <> 'scored' AND "robot_id" IS NULL AND "judge_seat" IS NULL AND "action" IS NULL)`,
)
@Check(
    'CHK_match_events_judge_seat',
    '"judge_seat" IS NULL OR "judge_seat" IN (1, 2, 3)',
)
@Check('CHK_match_events_action', '"action" IS NULL OR "action" IN (1, -1)')
/** One entry of a match's timeline. Append-only: no soft delete, no modified_at. */
@Entity('match_events')
export class MatchEvent {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'match_id', type: 'uuid', nullable: false })
    matchId: string;

    @ManyToOne(() => Match, { nullable: false })
    @JoinColumn({ name: 'match_id' })
    match?: Relation<Match>;

    @Column({ name: 'type', type: 'varchar', nullable: false })
    type: MatchEventType;

    /** When the event happened, set by the caller (no default) */
    @Column({ name: 'occurred_at', type: 'timestamptz', nullable: false })
    occurredAt: Date;

    /** The user who triggered the event, if any */
    @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
    actorUserId: string | null;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'actor_user_id' })
    actor?: Relation<User> | null;

    /** Only on `scored` events: the robot the point was for */
    @Column({ name: 'robot_id', type: 'uuid', nullable: true })
    robotId: string | null;

    @ManyToOne(() => Robot, { nullable: true })
    @JoinColumn({ name: 'robot_id' })
    robot?: Relation<Robot> | null;

    @Column({ name: 'judge_seat', type: 'int', nullable: true })
    judgeSeat: JudgeSeat | null;

    @Column({ name: 'action', type: 'int', nullable: true })
    action: ScoreAction | null;
}
