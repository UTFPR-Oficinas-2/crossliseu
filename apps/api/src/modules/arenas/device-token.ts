import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;
const BCRYPT_COST = 10;

/** A fresh device token: 32 random bytes, hex-encoded. Shown once, never stored in plain text. */
export function generateDeviceToken(): string {
    return randomBytes(TOKEN_BYTES).toString('hex');
}

export function hashDeviceToken(token: string): Promise<string> {
    return bcrypt.hash(token, BCRYPT_COST);
}

// Compared against when the device id is unknown, so that case takes as long as a wrong token
const DUMMY_HASH = bcrypt.hashSync('not-a-device-token', BCRYPT_COST);

/**
 * Whether `token` matches the stored hash. A null hash (unknown or deleted device) still runs one
 * bcrypt compare, so the response time doesn't tell which device ids exist.
 */
export async function verifyDeviceToken(
    token: string,
    tokenHash: string | null,
): Promise<boolean> {
    const matches = await bcrypt.compare(token, tokenHash ?? DUMMY_HASH);
    return tokenHash !== null && matches;
}
