import type { Relation } from 'typeorm';
import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
} from 'typeorm';
import { Match } from './match.entity.js';
import type { JudgeSeat } from './match-event.entity.js';

// Expression index from the migration: (match_id, lower(name)), so a name holds
// one seat per match whatever its case. `synchronize: false` keeps migration:generate from
// dropping it.
@Index('UQ_match_referees_match_id_lower_name', { synchronize: false })
@Unique('UQ_match_referees_match_id_seat', ['matchId', 'seat'])
@Check('CHK_match_referees_seat', '"seat" IN (1, 2, 3)')
/** A referee seated on one match by name, without an account. Append-only. */
@Entity('match_referees')
export class MatchReferee {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'match_id', type: 'uuid', nullable: false })
    matchId: string;

    @ManyToOne(() => Match, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({
        name: 'match_id',
        foreignKeyConstraintName: 'FK_match_referees_match_id',
    })
    match?: Relation<Match>;

    /** As typed at the first join, after normalizing whitespace */
    @Column({ name: 'name', type: 'varchar', nullable: false })
    name: string;

    @Column({ name: 'seat', type: 'int', nullable: false })
    seat: JudgeSeat;

    @CreateDateColumn({ name: 'joined_at', type: 'timestamptz' })
    joinedAt: Date;
}
