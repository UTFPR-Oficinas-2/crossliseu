import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { QueryFailedError } from 'typeorm';
import type { DataSource } from 'typeorm';
import { User } from '../src/modules/users/entities/user.entity.js';
import {
    createTestApp,
    createUser,
    dataSourceOf,
    loginToken,
    resetDatabase,
} from './helpers.js';

describe('users', () => {
    let app: INestApplication;
    let ds: DataSource;

    beforeAll(async () => {
        app = await createTestApp();
        ds = dataSourceOf(app);
    });

    beforeEach(async () => {
        await resetDatabase(ds);
    });

    afterAll(async () => {
        await app.close();
    });

    it('has no /users routes', async () => {
        await createUser(ds, 'admin', 'pw');
        const token = await loginToken(app, 'admin', 'pw');

        for (const [method, path] of [
            ['get', '/users'],
            ['get', '/users/11111111-1111-4111-8111-111111111111'],
            ['patch', '/users/11111111-1111-4111-8111-111111111111'],
            ['delete', '/users/11111111-1111-4111-8111-111111111111'],
        ] as const) {
            await request(app.getHttpServer())
                [method](path)
                .set('Authorization', `Bearer ${token}`)
                .expect(404);
        }
    });

    it('refuses a second live user with the same username', async () => {
        await createUser(ds, 'admin', 'pw');

        const error: unknown = await createUser(ds, 'admin', 'other').catch(
            (e: unknown) => e,
        );

        expect(error).toBeInstanceOf(QueryFailedError);
        expect(
            (
                (error as QueryFailedError).driverError as unknown as {
                    code: string;
                }
            ).code,
        ).toBe('23505');
    });

    it('frees the username of a soft-deleted user', async () => {
        const first = await createUser(ds, 'admin', 'pw');
        await ds.getRepository(User).softDelete({ id: first.id });

        await expect(createUser(ds, 'admin', 'other')).resolves.toBeDefined();
    });
});
