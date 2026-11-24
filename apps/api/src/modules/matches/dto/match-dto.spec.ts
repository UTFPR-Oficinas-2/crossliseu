import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMatchDto } from './create-match.dto.js';
import { UpdateMatchDto } from './update-match.dto.js';
import { CloseMatchDto } from './close-match.dto.js';

const body = {
    championshipId: '11111111-1111-4111-8111-111111111111',
    robotAId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    robotBId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
};

// Same options as the global ValidationPipe in main.ts
const options = { whitelist: true, forbidNonWhitelisted: true };

async function errorsFor(cls: new () => object, plain: object) {
    const errors = await validate(plainToInstance(cls, plain), options);
    return errors.map((error) => error.property);
}

describe('match DTOs', () => {
    it('closes with no body or with a draw call', async () => {
        expect(await errorsFor(CloseMatchDto, {})).toEqual([]);
        expect(await errorsFor(CloseMatchDto, { draw: true })).toEqual([]);
        expect(await errorsFor(CloseMatchDto, { draw: false })).toEqual([]);
    });

    it('rejects a draw that is not a boolean, and a client-supplied winner', async () => {
        expect(await errorsFor(CloseMatchDto, { draw: 'yes' })).toEqual([
            'draw',
        ]);
        expect(
            await errorsFor(CloseMatchDto, { winnerRobotId: body.robotAId }),
        ).toEqual(['winnerRobotId']);
    });

    it('creates from the championship and both robots, with no date', async () => {
        expect(await errorsFor(CreateMatchDto, body)).toEqual([]);
    });

    it('rejects a scheduledAt on create, the date is gone', async () => {
        expect(
            await errorsFor(CreateMatchDto, {
                ...body,
                scheduledAt: '2026-11-10T14:00:00Z',
            }),
        ).toEqual(['scheduledAt']);
    });

    it('rejects a client-supplied creator', async () => {
        expect(
            await errorsFor(CreateMatchDto, {
                ...body,
                createdByUserId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            }),
        ).toEqual(['createdByUserId']);
    });

    it('lets an update change only the robots', async () => {
        expect(
            await errorsFor(UpdateMatchDto, {
                robotBId: body.robotBId,
            }),
        ).toEqual([]);
    });

    it('rejects a scheduledAt on update', async () => {
        expect(
            await errorsFor(UpdateMatchDto, {
                scheduledAt: '2026-11-11T09:30:00Z',
            }),
        ).toEqual(['scheduledAt']);
    });

    it('does not let an update move the match to another championship', async () => {
        expect(
            await errorsFor(UpdateMatchDto, {
                championshipId: body.championshipId,
            }),
        ).toEqual(['championshipId']);
    });
});
