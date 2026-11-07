import { randomBytes } from 'node:crypto';

const MAX_SLUG_LENGTH = 24;
const FALLBACK_SLUG = 'arena';
const SUFFIX_BYTES = 2;

/** Lowercase ASCII slug of the name, at most 24 chars, never empty and never edged by '-' */
export function slugifyArenaName(name: string): string {
    const slug = name
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, MAX_SLUG_LENGTH)
        .replace(/^-+|-+$/g, '');
    return slug || FALLBACK_SLUG;
}

/** `${slug}-${4 hex}`: readable on the box's config, made unique by the random suffix */
export function generateDeviceId(name: string): string {
    return `${slugifyArenaName(name)}-${randomBytes(SUFFIX_BYTES).toString('hex')}`;
}
