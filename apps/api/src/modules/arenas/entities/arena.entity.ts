import type { Relation } from 'typeorm';
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';
import { Match } from '../../matches/entities/match.entity.js';
import { User } from '../../users/entities/user.entity.js';

// Partial expression index from the ArenaOwners migration:
// (owner_user_id, lower(name)) WHERE deleted_at IS NULL. TypeORM can't express it, so
// `synchronize: false` keeps migration:generate from dropping it.
@Index('UQ_arenas_owner_user_id_lower_name', { synchronize: false })
@Unique('UQ_arenas_device_id', ['deviceId'])
@Unique('UQ_arenas_current_match_id', ['currentMatchId'])
@Entity('arenas')
export class Arena extends BaseEntity {
    // TypeORM calls the constructor without arguments when hydrating rows
    constructor(
        name?: string,
        deviceId?: string,
        tokenHash?: string,
        ownerUserId?: string,
    ) {
        super();

        if (!name || !deviceId || !tokenHash || !ownerUserId) {
            return;
        }

        this.name = name;
        this.deviceId = deviceId;
        this.tokenHash = tokenHash;
        this.ownerUserId = ownerUserId;
        this.currentMatchId = null;
    }

    @Column({ name: 'name', type: 'varchar', nullable: false })
    name: string;

    @Column({ name: 'device_id', type: 'varchar', nullable: false })
    deviceId: string;

    // bcrypt hash of the device token; the plain token is never stored
    @Column({ name: 'token_hash', type: 'varchar', nullable: false })
    tokenHash: string;

    // The match running (or about to run) on this arena now; matches.arena_id is the history
    @Column({ name: 'current_match_id', type: 'uuid', nullable: true })
    currentMatchId: string | null;

    @ManyToOne(() => Match, { nullable: true })
    @JoinColumn({ name: 'current_match_id' })
    currentMatch?: Relation<Match> | null;

    @Column({ name: 'owner_user_id', type: 'uuid', nullable: false })
    ownerUserId: string;

    @ManyToOne(() => User, { nullable: false })
    @JoinColumn({ name: 'owner_user_id' })
    owner?: Relation<User>;
}
