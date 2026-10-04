import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';

@Entity()
export class Robot extends BaseEntity {
    constructor(name: string) {
        super();

        this.name = name;
    }

    @Column({ name: 'name', type: 'varchar', nullable: false })
    name: string;
}
