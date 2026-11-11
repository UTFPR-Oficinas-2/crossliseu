import 'reflect-metadata';
import { R2RecordingStorage } from './recording-storage.js';

describe('R2RecordingStorage.presignUpload', () => {
    beforeEach(() => {
        vi.stubEnv('R2_ENDPOINT_URL', 'https://acct.r2.cloudflarestorage.com');
        vi.stubEnv('R2_ACCESS_KEY_ID', 'AKIAEXAMPLE');
        vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
        vi.stubEnv('R2_BUCKET', 'bucket');
    });
    afterEach(() => vi.unstubAllEnvs());

    it('signs content-type and content-length, and no checksum of an empty body', async () => {
        const url = new URL(
            await new R2RecordingStorage().presignUpload(
                'recordings/m/x.mp4',
                'video/mp4',
                1234,
                900,
            ),
        );

        const signed = url.searchParams.get('X-Amz-SignedHeaders') ?? '';
        expect(signed).toContain('content-type');
        expect(signed).toContain('content-length');
        // The SDK would add a CRC32 of the (empty) body that R2 may check against the real upload
        expect(url.search.toLowerCase()).not.toContain('checksum');
    });
});
