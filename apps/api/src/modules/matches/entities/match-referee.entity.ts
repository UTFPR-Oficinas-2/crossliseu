import type { Relation } from 'typeorm';
import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
} from 'typeorm';
import { Match } from './match.entity.js';
import type { JudgeSeat } from './match-event.entity.js';

@Unique('UQ_match_referees_match_id_name_key', ['matchId', 'nameKey'])
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

    /** `nameKey(name)`: what a rejoin is matched by */
    @Column({ name: 'name_key', type: 'varchar', nullable: false })
    nameKey: string;

    @Column({ name: 'seat', type: 'int', nullable: false })
    seat: JudgeSeat;

    @CreateDateColumn({ name: 'joined_at', type: 'timestamptz' })
    joinedAt: Date;
}
