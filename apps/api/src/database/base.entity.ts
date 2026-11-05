// src/database/base.entity.ts
import {
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    DeleteDateColumn,
} from 'typeorm';

export abstract class BaseEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    // NULL until the row is first updated
    @UpdateDateColumn({
        name: 'modified_at',
        type: 'timestamptz',
        nullable: true,
        default: null,
    })
    modifiedAt: Date | null;

    @DeleteDateColumn({
        name: 'deleted_at',
        type: 'timestamptz',
        nullable: true,
    })
    deletedAt: Date | null;
}
