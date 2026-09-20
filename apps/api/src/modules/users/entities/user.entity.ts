import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';

@Entity('users')
export class User extends BaseEntity {
    @Column({ name: 'username', type: 'varchar', nullable: false })
    username: string;

    @Column({ name: 'email', type: 'varchar', nullable: false })
    email: string;

    @Column({ name: 'password', type: 'varchar', nullable: false })
    password: string;
}
