import { generateDeviceId, slugifyArenaName } from './device-id.js';

describe('slugifyArenaName', () => {
    it.each([
        ['Arena da garagem', 'arena-da-garagem'],
        ['  Árena  Ção!! ', 'arena-cao'],
        ['!!!', 'arena'],
        ['日本', 'arena'],
        ['Ç', 'c'],
    ])('turns %j into %j', (name, slug) => {
        expect(slugifyArenaName(name)).toBe(slug);
    });

    it('drops the hyphen a cut at 24 characters lands on', () => {
        const name = `${'a'.repeat(23)} ${'b'.repeat(16)}`;

        const slug = slugifyArenaName(name);

        expect(slug).toBe('a'.repeat(23));
        expect(slug.length).toBeLessThanOrEqual(24);
        expect(slug.endsWith('-')).toBe(false);
    });

    it('never produces a double hyphen', () => {
        for (const name of ['a -- b', 'a___b', '--a--', 'a!?b  c']) {
            expect(slugifyArenaName(name)).not.toContain('--');
        }
    });
});

describe('generateDeviceId', () => {
    it('appends 4 hex chars to the slug', () => {
        expect(generateDeviceId('Arena da garagem')).toMatch(
            /^arena-da-garagem-[0-9a-f]{4}$/,
        );
    });

    it('falls back to arena when the slug is empty', () => {
        expect(generateDeviceId('!!!')).toMatch(/^arena-[0-9a-f]{4}$/);
    });
});
