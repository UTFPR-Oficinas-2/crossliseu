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
