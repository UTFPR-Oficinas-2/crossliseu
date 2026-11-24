import { describe, expect, it, vi } from 'vitest';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import {
    AnalysisQueue,
    AnalysisQueueUnavailable,
    parseAnalysisResult,
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

describe('parseAnalysisResult', () => {
    const base = { matchId: 'm1', videoKey: 'recordings/m1/a.mp4' };

    it('splits the worker message into the fields the API needs and the rest', () => {
        expect(
            parseAnalysisResult({
                ...base,
                status: 'done',
                totalFrames: 300,
                robots: {},
            }),
        ).toEqual({
            ...base,
            status: 'done',
            details: { totalFrames: 300, robots: {} },
        });
    });

    it.each([
        ['not an object', 'done'],
        ['null', null],
        ['an array', []],
        ['no matchId', { videoKey: 'k', status: 'done' }],
        [
            'no videoKey (worker older than #21)',
            { matchId: 'm', status: 'done' },
        ],
        ['an unknown status', { ...base, status: 'finished' }],
    ])('returns null for %s', (_, raw) => {
        expect(parseAnalysisResult(raw)).toBeNull();
    });
});

describe('AnalysisQueue result consumer', () => {
    function delivery(body: unknown, redelivered = false) {
        return {
            content: Buffer.from(
                typeof body === 'string' ? body : JSON.stringify(body),
            ),
            fields: { redelivered },
        } as unknown as ConsumeMessage;
    }

    function setup(handler: () => Promise<void>) {
        const channel = { ack: vi.fn(), nack: vi.fn() };
        const queue = new AnalysisQueue(null);
        // onResult is private: it is what the channel calls for every message
        const onResult = (message: ConsumeMessage) =>
            (
                queue as unknown as {
                    onResult: (
                        c: unknown,
                        m: ConsumeMessage,
                        h: () => Promise<void>,
                    ) => Promise<void>;
                }
            ).onResult(channel, message, handler);
        return { channel, onResult };
    }

    const valid = { matchId: 'm', videoKey: 'k', status: 'running' };

    it('acks once the handler stored the result', async () => {
        const handler = vi.fn().mockResolvedValue(undefined);
        const { channel, onResult } = setup(handler);
        const message = delivery(valid);

        await onResult(message);

        expect(handler).toHaveBeenCalledWith({
            matchId: 'm',
            videoKey: 'k',
            status: 'running',
            details: {},
        });
        expect(channel.ack).toHaveBeenCalledWith(message);
    });

    it('drops a message that is not JSON or not valid, without calling the handler', async () => {
        const handler = vi.fn();
        const { channel, onResult } = setup(handler);

        await onResult(delivery('not json'));
        await onResult(delivery({ matchId: 'm', status: 'done' }));

        expect(handler).not.toHaveBeenCalled();
        expect(channel.ack).toHaveBeenCalledTimes(2);
    });

    it('puts the message back once when the handler fails', async () => {
        const { channel, onResult } = setup(() =>
            Promise.reject(new Error('db down')),
        );
        const message = delivery(valid);

        await onResult(message);

        expect(channel.nack).toHaveBeenCalledWith(message, false, true);
        expect(channel.ack).not.toHaveBeenCalled();
    });

    it('drops it when it fails again after coming back', async () => {
        const { channel, onResult } = setup(() =>
            Promise.reject(new Error('db down')),
        );
        const message = delivery(valid, true);

        await onResult(message);

        expect(channel.nack).toHaveBeenCalledWith(message, false, false);
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
