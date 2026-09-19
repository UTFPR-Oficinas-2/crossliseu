import { BaseEntity, Column, Entity } from 'typeorm';

@Entity('users')
export class User extends BaseEntity {
    @Column({ name: 'name', type: 'varchar', nullable: false })
    name: string;

    @Column({ name: 'email', type: 'varchar', nullable: false })
    email: string;

    @Column({ name: 'password_hash', type: 'varchar', nullable: false })
    passwordHash: string;
}
