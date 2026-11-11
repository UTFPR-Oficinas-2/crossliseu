import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { R2RecordingStorage } from './recording-storage.js';

const R2_VARIABLES = {
    R2_ENDPOINT_URL: 'https://account.r2.cloudflarestorage.com',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
    R2_BUCKET: 'test-bucket',
};

describe('R2RecordingStorage.presignUpload', () => {
    const original: Record<string, string | undefined> = {};

    beforeEach(() => {
        for (const [name, value] of Object.entries(R2_VARIABLES)) {
            original[name] = process.env[name];
            process.env[name] = value;
        }
    });

    afterEach(() => {
        for (const name of Object.keys(R2_VARIABLES)) {
            if (original[name] === undefined) delete process.env[name];
            else process.env[name] = original[name];
        }
    });

    async function presign() {
        const url = await new R2RecordingStorage().presignUpload(
            'recordings/match-1.mp4',
            'video/mp4',
            900,
        );
        return new URL(url);
    }

    it('does not sign SDK checksum parameters', async () => {
        const { searchParams } = await presign();

        // The browser sends the file as is: a checksum the signer never saw would be refused
        expect(searchParams.has('x-amz-checksum-crc32')).toBe(false);
        expect(searchParams.has('x-amz-sdk-checksum-algorithm')).toBe(false);
    });

    it('signs the Content-Type so R2 refuses a PUT with another one', async () => {
        const { searchParams } = await presign();

        expect(searchParams.get('X-Amz-SignedHeaders')).toContain(
            'content-type',
        );
    });
});
