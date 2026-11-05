import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMatchDto } from './create-match.dto.js';
import { UpdateMatchDto } from './update-match.dto.js';

const body = {
    championshipId: '11111111-1111-4111-8111-111111111111',
    robotAId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    robotBId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    scheduledAt: '2026-11-10T14:00:00Z',
};

// Same options as the global ValidationPipe in main.ts
const options = { whitelist: true, forbidNonWhitelisted: true };

async function errorsFor(
    cls: typeof CreateMatchDto | typeof UpdateMatchDto,
    plain: object,
) {
    const errors = await validate(plainToInstance(cls, plain), options);
    return errors.map((error) => error.property);
}

describe('match DTOs', () => {
    it('turns an ISO scheduledAt into a Date', async () => {
        const dto = plainToInstance(CreateMatchDto, body);

        expect(await validate(dto, options)).toEqual([]);
        expect(dto.scheduledAt).toEqual(new Date('2026-11-10T14:00:00Z'));
    });

    it('requires scheduledAt on create', async () => {
        const { scheduledAt: _omitted, ...withoutDate } = body;

        expect(await errorsFor(CreateMatchDto, withoutDate)).toEqual([
            'scheduledAt',
        ]);
    });

    it('rejects a scheduledAt that is not a date', async () => {
        expect(
            await errorsFor(CreateMatchDto, {
                ...body,
                scheduledAt: 'tomorrow',
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

    it('lets an update change only scheduledAt', async () => {
        expect(
            await errorsFor(UpdateMatchDto, {
                scheduledAt: '2026-11-11T09:30:00Z',
            }),
        ).toEqual([]);
    });

    it('does not let an update move the match to another championship', async () => {
        expect(
            await errorsFor(UpdateMatchDto, {
                championshipId: body.championshipId,
            }),
        ).toEqual(['championshipId']);
    });
});
