import {
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import {
    HeadObjectCommand,
    NotFound,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Where the fight recordings live. Abstract so the service can be tested with a fake; the real
 * one is R2RecordingStorage (the same pattern as Clock in the matches module).
 */
export abstract class RecordingStorage {
    /** URL that allows one PUT of `key` with exactly this Content-Type, for `expiresInSeconds` */
    abstract presignUpload(
        key: string,
        contentType: string,
        expiresInSeconds: number,
    ): Promise<string>;

    /** Size in bytes of the object at `key`, or null when it is not there */
    abstract objectSize(key: string): Promise<number | null>;
}

interface R2Settings {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
}

/** R2_* from the environment, or null while any of them is missing */
export function r2SettingsFromEnv(
    env: NodeJS.ProcessEnv = process.env,
): R2Settings | null {
    const endpoint = env.R2_ENDPOINT_URL;
    const accessKeyId = env.R2_ACCESS_KEY_ID;
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
    const bucket = env.R2_BUCKET;
    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
    return { endpoint, accessKeyId, secretAccessKey, bucket };
}

/**
 * Cloudflare R2 through its S3-compatible API. The R2_* variables are optional for the API to
 * start (most screens don't need them); the recording routes answer 503
 * `recording_storage_not_configured` until they are set.
 */
@Injectable()
export class R2RecordingStorage extends RecordingStorage {
    private readonly logger = new Logger(R2RecordingStorage.name);
    private readonly settings = r2SettingsFromEnv();
    private readonly client = this.settings
        ? new S3Client({
              endpoint: this.settings.endpoint,
              region: 'auto', // R2 has no regions
              credentials: {
                  accessKeyId: this.settings.accessKeyId,
                  secretAccessKey: this.settings.secretAccessKey,
              },
          })
        : null;

    async presignUpload(
        key: string,
        contentType: string,
        expiresInSeconds: number,
    ) {
        const { client, bucket } = this.configured();
        return getSignedUrl(
            client,
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                ContentType: contentType,
            }),
            {
                expiresIn: expiresInSeconds,
                // Without this the SDK leaves Content-Type out of the signature, and the URL
                // accepts any type: signing it makes R2 refuse a PUT with another one (403)
                signableHeaders: new Set(['content-type']),
            },
        );
    }

    async objectSize(key: string) {
        const { client, bucket } = this.configured();
        try {
            const head = await client.send(
                new HeadObjectCommand({ Bucket: bucket, Key: key }),
            );
            return head.ContentLength ?? 0;
        } catch (error) {
            // HEAD has no body, so a missing key can also surface as a bare 404
            const status = (
                error as { $metadata?: { httpStatusCode?: number } }
            ).$metadata?.httpStatusCode;
            if (error instanceof NotFound || status === 404) return null;
            throw error;
        }
    }

    private configured() {
        if (!this.client || !this.settings) {
            this.logger.error('recording_storage_not_configured');
            throw new ServiceUnavailableException(
                'recording_storage_not_configured',
            );
        }
        return { client: this.client, bucket: this.settings.bucket };
    }
}
