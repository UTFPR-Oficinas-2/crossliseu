import * as bcrypt from 'bcrypt';
import { generateDeviceToken, hashDeviceToken } from './device-token.js';

describe('device token', () => {
    it('is 64 hex characters', () => {
        expect(generateDeviceToken()).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is random on each call', () => {
        expect(generateDeviceToken()).not.toBe(generateDeviceToken());
    });

    it('hashes with bcrypt so only the original token matches', async () => {
        const token = generateDeviceToken();
        const hash = await hashDeviceToken(token);

        expect(hash).not.toBe(token);
        expect(await bcrypt.compare(token, hash)).toBe(true);
        expect(await bcrypt.compare('other', hash)).toBe(false);
    });
});
