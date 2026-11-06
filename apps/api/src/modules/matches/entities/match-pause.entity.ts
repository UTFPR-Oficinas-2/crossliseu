import type { Relation } from 'typeorm';
import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Match } from './match.entity.js';
import { User } from '../../users/entities/user.entity.js';

// Partial unique index from the baseline migration: (match_id) WHERE resumed_at IS NULL, so a
// match has at most one open pause. `synchronize: false` keeps migration:generate from dropping it.
@Index('UQ_match_pauses_open', { synchronize: false })
@Entity('match_pauses')
export class MatchPause {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'match_id', type: 'uuid', nullable: false })
    matchId: string;

    @ManyToOne(() => Match, { nullable: false })
    @JoinColumn({ name: 'match_id' })
    match?: Relation<Match>;

    @Column({ name: 'paused_by_user_id', type: 'uuid', nullable: false })
    pausedByUserId: string;

    @ManyToOne(() => User, { nullable: false })
    @JoinColumn({ name: 'paused_by_user_id' })
    pausedBy?: Relation<User>;

    @Column({ name: 'paused_at', type: 'timestamptz', nullable: false })
    pausedAt: Date;

    /** NULL while the match is paused */
    @Column({ name: 'resumed_at', type: 'timestamptz', nullable: true })
    resumedAt: Date | null;
}
