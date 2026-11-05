import type { Relation } from 'typeorm';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';
import { Championship } from '../../championships/entities/championship.entity.js';
import { User } from '../../users/entities/user.entity.js';
import type { WeightClass } from '../weight-class.js';

// Partial expression index from the baseline migration:
// (championship_id, lower(name)) WHERE deleted_at IS NULL. TypeORM can't express it, so
// `synchronize: false` keeps migration:generate from dropping it.
@Index('UQ_robots_championship_id_lower_name', { synchronize: false })
@Entity('robots')
export class Robot extends BaseEntity {
    // TypeORM calls the constructor without arguments when hydrating rows
    constructor(
        name?: string,
        weightClass?: WeightClass,
        team?: string,
        championshipId?: string,
        createdByUserId?: string,
    ) {
        super();

        if (
            !name ||
            !weightClass ||
            !team ||
            !championshipId ||
            !createdByUserId
        ) {
            return;
        }

        this.name = name;
        this.weightClass = weightClass;
        this.team = team;
        this.championshipId = championshipId;
        this.createdByUserId = createdByUserId;
    }

    @Column({ name: 'name', type: 'varchar', nullable: false })
    name: string;

    // CHECK constraint in the baseline migration limits it to WEIGHT_CLASSES
    @Column({ name: 'weight_class', type: 'varchar', nullable: false })
    weightClass: WeightClass;

    @Column({ name: 'team', type: 'varchar', nullable: false })
    team: string;

    @Column({ name: 'championship_id', type: 'uuid', nullable: false })
    championshipId: string;

    @ManyToOne(() => Championship, { nullable: false })
    @JoinColumn({ name: 'championship_id' })
    championship?: Relation<Championship>;

    @Column({ name: 'created_by_user_id', type: 'uuid', nullable: false })
    createdByUserId: string;

    @ManyToOne(() => User, { nullable: false })
    @JoinColumn({ name: 'created_by_user_id' })
    createdBy?: Relation<User>;
}
