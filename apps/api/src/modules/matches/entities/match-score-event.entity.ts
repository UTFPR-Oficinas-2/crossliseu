import type { Relation } from 'typeorm';
import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Match } from './match.entity.js';
import { Robot } from '../../robots/entities/robot.entity.js';

export type JudgeSeat = 1 | 2 | 3;
export type ScoreAction = 1 | -1;

/** One judge's +1 / -1 for a robot. Append-only: no soft delete, no modified_at. */
@Check('CHK_match_score_events_judge_seat', '"judge_seat" IN (1, 2, 3)')
@Check('CHK_match_score_events_action', '"action" IN (1, -1)')
@Entity('match_score_events')
export class MatchScoreEvent {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'match_id', type: 'uuid', nullable: false })
    matchId: string;

    @ManyToOne(() => Match, { nullable: false })
    @JoinColumn({ name: 'match_id' })
    match?: Relation<Match>;

    @Column({ name: 'robot_id', type: 'uuid', nullable: false })
    robotId: string;

    @ManyToOne(() => Robot, { nullable: false })
    @JoinColumn({ name: 'robot_id' })
    robot?: Relation<Robot>;

    @Column({ name: 'judge_seat', type: 'int', nullable: false })
    judgeSeat: JudgeSeat;

    @Column({ name: 'action', type: 'int', nullable: false })
    action: ScoreAction;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
