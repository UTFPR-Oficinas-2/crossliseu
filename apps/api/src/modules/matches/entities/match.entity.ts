import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';

@Entity('matches')
export class Match extends BaseEntity {
  @Column({ name: 'weight_class', type: 'varchar', nullable: false })
  weightClass!: string;
}
