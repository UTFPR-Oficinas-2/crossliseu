import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
    CompleteRecordingDto,
    MAX_RECORDING_BYTES,
    RequestUploadUrlDto,
} from './recording.dto.js';

// Same options as the global ValidationPipe in main.ts
const options = { whitelist: true, forbidNonWhitelisted: true };

async function properties(type: new () => object, plain: object) {
    const errors = await validate(plainToInstance(type, plain), options);
    return errors.map((error) => error.property);
}

describe('RequestUploadUrlDto', () => {
    const base = { contentType: 'video/mp4' };

    it('accepts a size up to the cap', async () => {
        expect(
            await properties(RequestUploadUrlDto, {
                ...base,
                size: MAX_RECORDING_BYTES,
            }),
        ).toEqual([]);
    });

    it.each([0, 1.5, MAX_RECORDING_BYTES + 1, 'big', undefined])(
        'rejects size %j',
        async (size) => {
            expect(
                await properties(RequestUploadUrlDto, { ...base, size }),
            ).toEqual(['size']);
        },
    );
});

describe('CompleteRecordingDto', () => {
    const base = { key: 'recordings/m/x.mp4' };

    it('accepts a size up to the cap', async () => {
        expect(
            await properties(CompleteRecordingDto, {
                ...base,
                size: MAX_RECORDING_BYTES,
            }),
        ).toEqual([]);
    });

    it.each([0, 1.5, MAX_RECORDING_BYTES + 1])(
        'rejects size %j',
        async (size) => {
            expect(
                await properties(CompleteRecordingDto, { ...base, size }),
            ).toEqual(['size']);
        },
    );

    it('rejects a key longer than 200 characters', async () => {
        expect(
            await properties(CompleteRecordingDto, {
                key: 'k'.repeat(201),
                size: 1,
            }),
        ).toEqual(['key']);
    });
});
