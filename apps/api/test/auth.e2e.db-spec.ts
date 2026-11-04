import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import {
    createTestApp,
    createUser,
    dataSourceOf,
    loginToken,
    resetDatabase,
} from './helpers.js';

describe('auth, guards and validation (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;

    beforeAll(async () => {
        app = await createTestApp();
        ds = dataSourceOf(app);
    });

    beforeEach(async () => {
        await resetDatabase(ds);
        await createUser(ds, 'admin', 'right-password');
    });

    afterAll(async () => {
        await app.close();
    });

    const http = () => request(app.getHttpServer());

    it('logs in with the right password', async () => {
        const response = await http()
            .post('/auth/login')
            .send({ username: 'admin', password: 'right-password' })
            .expect(201);

        expect(typeof response.body.token).toBe('string');
    });

    it('answers a wrong password and an unknown username the same way', async () => {
        const wrong = await http()
            .post('/auth/login')
            .send({ username: 'admin', password: 'nope' })
            .expect(401);
        const unknown = await http()
            .post('/auth/login')
            .send({ username: 'ghost', password: 'nope' })
            .expect(401);

        expect(unknown.body).toEqual(wrong.body);
    });

    it('rejects a login without a password with 401', async () => {
        await http()
            .post('/auth/login')
            .send({ username: 'admin' })
            .expect(401);
    });

    it('serves @Public() routes without a token', async () => {
        await http().get('/championships').expect(200);
    });

    it('requires a token on other routes', async () => {
        await http().post('/championships').send({}).expect(401);
    });

    it('rejects a token signed with another secret', async () => {
        const forged = new JwtService({ secret: 'not-the-secret' }).sign({
            username: 'admin',
            sub: 'x',
        });

        await http()
            .post('/championships')
            .set('Authorization', `Bearer ${forged}`)
            .send({})
            .expect(401);
    });

    it('validates bodies with the global ValidationPipe', async () => {
        const token = await loginToken(app, 'admin', 'right-password');

        const response = await http()
            .post('/championships')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'X', startDate: 'nope', endDate: '2026-11-04' })
            .expect(400);

        // The pipe's message, not the service's championship_end_before_start
        expect(response.body.message).toEqual([
            'startDate must be a Date instance',
        ]);
    });

    it('rejects unknown body fields', async () => {
        const token = await loginToken(app, 'admin', 'right-password');

        await http()
            .post('/championships')
            .set('Authorization', `Bearer ${token}`)
            .send({
                name: 'X',
                startDate: '2026-11-04',
                endDate: '2026-11-04',
                foo: 1,
            })
            .expect(400);
    });
});
