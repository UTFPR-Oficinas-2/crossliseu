import { describe, expect, it, vi } from 'vitest';
import type { ConfirmChannel } from 'amqplib';
import {
    AnalysisQueue,
    AnalysisQueueUnavailable,
    REQUEST_QUEUE,
    RESULT_QUEUE,
    rabbitUrlFromEnv,
    setupQueues,
} from './analysis-queue.js';

describe('rabbitUrlFromEnv', () => {
    it('returns the URL when set', () => {
        expect(
            rabbitUrlFromEnv({ RABBITMQ_URL: 'amqp://u:p@rabbitmq:5672/' }),
        ).toBe('amqp://u:p@rabbitmq:5672/');
    });

    it('returns null when missing or empty', () => {
        expect(rabbitUrlFromEnv({})).toBeNull();
        expect(rabbitUrlFromEnv({ RABBITMQ_URL: '' })).toBeNull();
    });
});

describe('setupQueues', () => {
    it('declares both queues as durable, with the names the worker uses', async () => {
        const assertQueue = vi.fn().mockResolvedValue({});
        await setupQueues({ assertQueue } as unknown as ConfirmChannel);

        expect(assertQueue).toHaveBeenCalledWith('analysis.requested', {
            durable: true,
        });
        expect(assertQueue).toHaveBeenCalledWith('analysis.finished', {
            durable: true,
        });
        expect(REQUEST_QUEUE).toBe('analysis.requested');
        expect(RESULT_QUEUE).toBe('analysis.finished');
    });
});

describe('AnalysisQueue without RABBITMQ_URL', () => {
    it('starts and stops without connecting', async () => {
        const queue = new AnalysisQueue(null);
        queue.onModuleInit();

        expect(queue.connected).toBe(false);
        await expect(queue.onModuleDestroy()).resolves.toBeUndefined();
    });

    it('refuses to publish a job', async () => {
        const queue = new AnalysisQueue(null);
        queue.onModuleInit();

        await expect(
            queue.requestAnalysis({ matchId: 'm', videoKey: 'k' }),
        ).rejects.toBeInstanceOf(AnalysisQueueUnavailable);
    });
});
