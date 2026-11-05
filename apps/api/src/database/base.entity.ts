// src/database/base.entity.ts
import {
    BeforeUpdate,
    Column,
    CreateDateColumn,
    DeleteDateColumn,
    PrimaryGeneratedColumn,
} from 'typeorm';

export abstract class BaseEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    // NULL until the row is first updated. Not an @UpdateDateColumn: TypeORM always gives
    // that one DEFAULT now(). save() stamps it through touch(); repository.update() calls
    // skip entity listeners, so repositories pass their partials through touched().
    @Column({ name: 'modified_at', type: 'timestamptz', nullable: true })
    modifiedAt: Date | null;

    @DeleteDateColumn({
        name: 'deleted_at',
        type: 'timestamptz',
        nullable: true,
    })
    deletedAt: Date | null;

    @BeforeUpdate()
    protected touch() {
        this.modifiedAt = new Date();
    }
}

/** A partial for repository.update() with modified_at stamped */
export function touched<T extends object>(
    partial: T,
): T & { modifiedAt: Date } {
    return { ...partial, modifiedAt: new Date() };
}
