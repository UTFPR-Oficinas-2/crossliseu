import 'reflect-metadata';
import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { HealthController } from './health.controller.js';

function dataSource(query: () => Promise<unknown>): DataSource {
    return { query } as unknown as DataSource;
}

describe('HealthController', () => {
    it('reports ok when the database answers', async () => {
        const controller = new HealthController(
            dataSource(async () => [{ '?column?': 1 }]),
        );

        await expect(controller.check()).resolves.toEqual({ status: 'ok' });
    });

    it('fails with 503 when the database is unreachable', async () => {
        const controller = new HealthController(
            dataSource(async () => {
                throw new Error('connect ECONNREFUSED');
            }),
        );

        await expect(controller.check()).rejects.toBeInstanceOf(
            ServiceUnavailableException,
        );
    });
});
