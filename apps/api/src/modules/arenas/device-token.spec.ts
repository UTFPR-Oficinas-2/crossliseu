import * as bcrypt from 'bcrypt';
import {
    generateDeviceToken,
    hashDeviceToken,
    verifyDeviceToken,
} from './device-token.js';

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

    it('verifies a token against its hash', async () => {
        const token = generateDeviceToken();
        const hash = await hashDeviceToken(token);

        expect(await verifyDeviceToken(token, hash)).toBe(true);
        expect(await verifyDeviceToken('other', hash)).toBe(false);
    });

    it('rejects a missing hash only after doing the same bcrypt work', async () => {
        const started = performance.now();

        expect(await verifyDeviceToken(generateDeviceToken(), null)).toBe(
            false,
        );

        // An unknown device id must not answer faster than a known one (cost 10 takes tens of ms)
        expect(performance.now() - started).toBeGreaterThan(10);
    });
});
