import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Min } from 'class-validator';

/** Formats the web app records in (`RECORDING_MIME_TYPES` in apps/web), without codecs */
export const RECORDING_CONTENT_TYPES = ['video/mp4', 'video/webm'] as const;
export type RecordingContentType = (typeof RECORDING_CONTENT_TYPES)[number];

/** Body of POST /matches/:id/recording/upload-url */
export class RequestUploadUrlDto {
    @IsIn(RECORDING_CONTENT_TYPES)
    contentType: RecordingContentType;
}

/** Body of POST /matches/:id/recording/complete */
export class CompleteRecordingDto {
    /** The key returned by upload-url */
    @IsString()
    key: string;

    /** Bytes the browser uploaded; must match what R2 has */
    @Type(() => Number)
    @IsInt()
    @Min(1)
    size: number;
}
