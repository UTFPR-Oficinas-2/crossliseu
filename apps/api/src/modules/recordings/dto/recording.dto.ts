import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

/** Formats the web app records in (`RECORDING_MIME_TYPES` in apps/web), without codecs */
export const RECORDING_CONTENT_TYPES = ['video/mp4', 'video/webm'] as const;
export type RecordingContentType = (typeof RECORDING_CONTENT_TYPES)[number];

/** Largest recording accepted (a ~90 MB fight leaves wide margin); change the cap here only */
export const MAX_RECORDING_BYTES = 500 * 1024 * 1024;

/** Body of POST /matches/:id/recording/upload-url */
export class RequestUploadUrlDto {
    @IsIn(RECORDING_CONTENT_TYPES)
    contentType: RecordingContentType;

    /** Bytes the browser is going to upload; the presigned PUT only accepts exactly this size */
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(MAX_RECORDING_BYTES)
    size: number;
}

/** Body of POST /matches/:id/recording/complete */
export class CompleteRecordingDto {
    /** The key returned by upload-url */
    @IsString()
    @MaxLength(200)
    key: string;

    /** Bytes the browser uploaded; must match what R2 has */
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(MAX_RECORDING_BYTES)
    size: number;
}
