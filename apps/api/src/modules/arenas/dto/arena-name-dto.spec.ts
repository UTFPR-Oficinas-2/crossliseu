import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ArenaNameDto } from './arena-name.dto.js';

// Same options as the global ValidationPipe in main.ts
const options = { whitelist: true, forbidNonWhitelisted: true };

async function check(plain: object) {
    const dto = plainToInstance(ArenaNameDto, plain);
    const errors = await validate(dto, options);
    return { dto, properties: errors.map((error) => error.property) };
}

describe('ArenaNameDto', () => {
    it('trims and collapses whitespace', async () => {
        const { dto, properties } = await check({ name: '  A  b ' });

        expect(properties).toEqual([]);
        expect(dto.name).toBe('A b');
    });

    it.each(['', '   '])('rejects %j', async (name) => {
        expect((await check({ name })).properties).toEqual(['name']);
    });

    it('accepts 40 characters and rejects 41', async () => {
        expect((await check({ name: 'a'.repeat(40) })).properties).toEqual([]);
        expect((await check({ name: 'a'.repeat(41) })).properties).toEqual([
            'name',
        ]);
    });

    it('requires a name', async () => {
        expect((await check({})).properties).toEqual(['name']);
    });
});
