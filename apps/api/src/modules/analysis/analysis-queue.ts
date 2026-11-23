import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import {
    connect,
    type AmqpConnectionManager,
    type ChannelWrapper,
} from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';

/**
 * Queues shared with the CV worker (apps/cv-worker/src/worker.py). The names must match there.
 *
 *   analysis.requested  API -> worker   {"matchId", "videoKey"}
 *   analysis.finished   worker -> API   {"matchId", "status": ...}
 */
export const REQUEST_QUEUE = 'analysis.requested';
export const RESULT_QUEUE = 'analysis.finished';

/** Message on analysis.requested; the worker reads exactly these two fields (jobs.parse_request) */
export interface AnalysisRequest {
    matchId: string;
    videoKey: string;
}

/**
 * While RabbitMQ is down the manager keeps messages in memory until it reconnects. The caller is
 * an HTTP request, so it gives up after this long instead of hanging.
 */
export const PUBLISH_TIMEOUT_MS = 5_000;

/** The job could not be handed to RabbitMQ (not configured, down, or no confirm in time) */
export class AnalysisQueueUnavailable extends Error {}

/** RABBITMQ_URL from the environment, or null when it is not set */
export function rabbitUrlFromEnv(
    env: NodeJS.ProcessEnv = process.env,
): string | null {
    return env.RABBITMQ_URL || null;
}

/**
 * Declares both queues as durable, the same way the worker does: whoever connects first creates
 * them, and declaring an existing queue with the same settings is a no-op. Runs again on every
 * reconnect, so a RabbitMQ that lost its data gets the queues back.
 */
export async function setupQueues(channel: ConfirmChannel): Promise<void> {
    await channel.assertQueue(REQUEST_QUEUE, { durable: true });
    await channel.assertQueue(RESULT_QUEUE, { durable: true });
}

/**
 * The API's connection to RabbitMQ. Optional, like R2: without RABBITMQ_URL the API starts and
 * only logs a warning. amqp-connection-manager reconnects on its own when RabbitMQ restarts, so
 * the API never has to be restarted because of the broker.
 */
@Injectable()
export class AnalysisQueue implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(AnalysisQueue.name);
    private connection: AmqpConnectionManager | null = null;
    private channel: ChannelWrapper | null = null;

    constructor(private readonly url: string | null = rabbitUrlFromEnv()) {}

    /** True while connected to RabbitMQ */
    get connected(): boolean {
        return this.connection?.isConnected() ?? false;
    }

    onModuleInit() {
        if (!this.url) {
            this.logger.warn(
                'RABBITMQ_URL not set: analysis jobs are disabled',
            );
            return;
        }

        this.connection = connect([this.url]);
        this.connection.on('connect', () =>
            this.logger.log('connected to RabbitMQ'),
        );
        // Not an error the API must act on: the manager keeps retrying in the background
        this.connection.on('disconnect', ({ err }) =>
            this.logger.warn(
                `RabbitMQ disconnected (${err?.message ?? 'no reason'}); retrying`,
            ),
        );

        this.channel = this.connection.createChannel({
            json: true,
            setup: setupQueues,
        });
    }

    /**
     * Puts one job on analysis.requested. Resolves once RabbitMQ has stored it (a confirm channel
     * and a persistent message, so it survives a broker restart). Throws AnalysisQueueUnavailable
     * when that does not happen.
     */
    async requestAnalysis(request: AnalysisRequest): Promise<void> {
        if (!this.channel) {
            throw new AnalysisQueueUnavailable('RABBITMQ_URL not set');
        }
        try {
            await this.channel.sendToQueue(REQUEST_QUEUE, request, {
                persistent: true,
                contentType: 'application/json',
                timeout: PUBLISH_TIMEOUT_MS,
            });
        } catch (error) {
            throw new AnalysisQueueUnavailable(String(error), {
                cause: error,
            });
        }
    }

    async onModuleDestroy() {
        await this.channel?.close();
        await this.connection?.close();
    }
}
