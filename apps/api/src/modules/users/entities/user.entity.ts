import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';

// Partial expression indexes from the baseline migration: lower(username) and lower(email),
// unique WHERE deleted_at IS NULL. TypeORM can't express them, so `synchronize: false` keeps
// migration:generate from dropping them.
@Index('UQ_users_lower_username', { synchronize: false })
@Index('UQ_users_lower_email', { synchronize: false })
@Entity('users')
export class User extends BaseEntity {
    @Column({ name: 'username', type: 'varchar', nullable: false })
    username: string;

    @Column({ name: 'email', type: 'varchar', nullable: false })
    email: string;

    @Column({ name: 'password', type: 'varchar', nullable: false })
    password: string;
}
