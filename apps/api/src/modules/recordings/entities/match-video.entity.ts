import type { Relation } from 'typeorm';
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity.js';
import { Match } from '../../matches/entities/match.entity.js';
import { User } from '../../users/entities/user.entity.js';

export const MATCH_VIDEO_STATUSES = ['uploading', 'uploaded'] as const;
export type MatchVideoStatus = (typeof MATCH_VIDEO_STATUSES)[number];

/** bigint comes back from Postgres as a string; a video is far below Number.MAX_SAFE_INTEGER */
const bigintAsNumber = {
    to: (value: number | null) => value,
    from: (value: string | null) => (value === null ? null : Number(value)),
};

/**
 * The fight recording of a match, stored in R2 (docs/recording-storage.md). One per match: a new
 * upload reuses the row and overwrites the same object key.
 *
 * uploading -> an upload URL was handed out; the file may not be in R2 yet
 * uploaded  -> the browser confirmed it and the object was found in R2
 */
@Index('UQ_match_videos_match_id', ['matchId'], { unique: true })
@Check('CHK_match_videos_status', `"status" IN ('uploading', 'uploaded')`)
@Entity('match_videos')
export class MatchVideo extends BaseEntity {
    @Column({ name: 'match_id', type: 'uuid', nullable: false })
    matchId: string;

    @ManyToOne(() => Match, { nullable: false })
    @JoinColumn({ name: 'match_id' })
    match?: Relation<Match>;

    /** Object key in the R2 bucket, e.g. "recordings/<matchId>.mp4" */
    @Column({ name: 'object_key', type: 'varchar', nullable: false })
    objectKey: string;

    /** "video/mp4" or "video/webm"; signed into the upload URL */
    @Column({ name: 'content_type', type: 'varchar', nullable: false })
    contentType: string;

    @Column({ name: 'status', type: 'varchar', nullable: false })
    status: MatchVideoStatus;

    /** Bytes, read from R2 when the upload is confirmed; null while uploading */
    @Column({
        name: 'size_bytes',
        type: 'bigint',
        nullable: true,
        transformer: bigintAsNumber,
    })
    sizeBytes: number | null;

    @Column({ name: 'uploaded_at', type: 'timestamptz', nullable: true })
    uploadedAt: Date | null;

    /** The operator who asked for the latest upload URL */
    @Column({ name: 'uploaded_by_user_id', type: 'uuid', nullable: false })
    uploadedByUserId: string;

    @ManyToOne(() => User, { nullable: false })
    @JoinColumn({ name: 'uploaded_by_user_id' })
    uploadedBy?: Relation<User>;
}
