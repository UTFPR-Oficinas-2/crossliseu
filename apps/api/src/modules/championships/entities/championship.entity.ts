import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';
import { User } from '../../users/entities/user.entity.js';

// The status (scheduled / ongoing / closed) is not stored: championshipStatus derives it from the dates
@Entity('championships')
export class Championship extends BaseEntity {
    // TypeORM calls the constructor without arguments when hydrating rows
    constructor(
        name?: string,
        startDate?: Date,
        endDate?: Date,
        createdByUserId?: string,
    ) {
        super();

        if (!name || !startDate || !endDate || !createdByUserId) {
            return;
        }

        this.name = name;
        this.startDate = startDate;
        this.endDate = endDate;
        this.createdByUserId = createdByUserId;
    }

    @Column({ name: 'name', type: 'varchar', nullable: false })
    name: string;

    @Column({ name: 'start_date', type: 'timestamptz', nullable: false })
    startDate: Date;

    @Column({ name: 'end_date', type: 'timestamptz', nullable: false })
    endDate: Date;

    @Column({ name: 'created_by_user_id', type: 'uuid', nullable: false })
    createdByUserId: string;

    @ManyToOne(() => User, { nullable: false })
    @JoinColumn({ name: 'created_by_user_id' })
    createdBy?: Relation<User>;
}
