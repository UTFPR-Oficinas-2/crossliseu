import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRobotDto } from './create-robot.dto.js';
import { UpdateRobotDto } from './update-robot.dto.js';
import { normalizeText } from './normalize.js';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';

describe('normalizeText', () => {
    it('trims and collapses whitespace', () => {
        expect(normalizeText('  Equipe \t  Volt  ')).toBe('Equipe Volt');
    });
});

describe('robot DTOs', () => {
    it('normalizes name and team on create', async () => {
        const dto = plainToInstance(CreateRobotDto, {
            name: '  Titã  ',
            team: 'Equipe   Volt',
            weightClass: 'heavyweight',
            championshipId: CHAMPIONSHIP_ID,
        });

        expect(await validate(dto)).toEqual([]);
        expect(dto).toMatchObject({
            name: 'Titã',
            team: 'Equipe Volt',
            weightClass: 'heavyweight',
        });
    });

    it.each(['lightweight', 'heavyweight'])(
        'accepts the %s weight class',
        async (weightClass) => {
            const dto = plainToInstance(CreateRobotDto, {
                name: 'Titã',
                team: 'Equipe Volt',
                weightClass,
                championshipId: CHAMPIONSHIP_ID,
            });

            expect(await validate(dto)).toEqual([]);
        },
    );

    it.each(['3 kg', 'Lightweight', ' lightweight', '', 42])(
        'rejects %j as a weight class',
        async (weightClass) => {
            const dto = plainToInstance(CreateRobotDto, {
                name: 'Titã',
                team: 'Equipe Volt',
                weightClass,
                championshipId: CHAMPIONSHIP_ID,
            });

            const errors = await validate(dto);

            expect(errors.map((error) => error.property)).toEqual([
                'weightClass',
            ]);
        },
    );

    it('rejects values that are blank after trimming', async () => {
        const dto = plainToInstance(CreateRobotDto, {
            name: '   ',
            team: 'Equipe Volt',
            weightClass: 'lightweight',
            championshipId: CHAMPIONSHIP_ID,
        });

        const errors = await validate(dto);

        expect(errors.map((error) => error.property)).toEqual(['name']);
    });

    it('leaves non-strings for @IsString to reject', async () => {
        const dto = plainToInstance(CreateRobotDto, {
            name: 42,
            team: 'Equipe Volt',
            weightClass: 'lightweight',
            championshipId: CHAMPIONSHIP_ID,
        });

        const errors = await validate(dto);

        expect(errors.map((error) => error.property)).toEqual(['name']);
    });

    it('applies the same rules on update', async () => {
        const dto = plainToInstance(UpdateRobotDto, {
            name: '  Titã ',
            weightClass: '3 kg',
        });

        expect(dto.name).toBe('Titã');
        expect((await validate(dto)).map((error) => error.property)).toEqual([
            'weightClass',
        ]);
    });
});
