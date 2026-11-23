import { Module } from '@nestjs/common';
import { AnalysisQueue } from './analysis-queue.js';

/**
 * Analysis jobs (#21): the API hands each uploaded recording to the CV worker through RabbitMQ
 * and reads the result back. See docs/recording-storage.md and docs/cv-worker-pipeline.md.
 */
@Module({
    providers: [{ provide: AnalysisQueue, useFactory: () => new AnalysisQueue() }],
    exports: [AnalysisQueue],
})
export class AnalysisModule {}
