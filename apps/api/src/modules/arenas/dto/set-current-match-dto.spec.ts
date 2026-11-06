import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SetCurrentMatchDto } from './set-current-match.dto.js';

// Same options as the global ValidationPipe in main.ts
const options = { whitelist: true, forbidNonWhitelisted: true };

async function errorsFor(plain: object) {
    const errors = await validate(
        plainToInstance(SetCurrentMatchDto, plain),
        options,
    );
    return errors.map((error) => error.property);
}

describe('SetCurrentMatchDto', () => {
    it('accepts a UUID matchId', async () => {
        expect(
            await errorsFor({
                matchId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            }),
        ).toEqual([]);
    });

    it('rejects a matchId that is not a UUID', async () => {
        expect(await errorsFor({ matchId: 'match-1' })).toEqual(['matchId']);
    });

    it('requires matchId', async () => {
        expect(await errorsFor({})).toEqual(['matchId']);
    });
});
