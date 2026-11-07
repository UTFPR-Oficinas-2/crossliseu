import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from '../auth/public-decorator.js';

/** Liveness probe for the Docker HEALTHCHECK; healthy only while the database answers */
@ApiTags('health')
@Controller('health')
export class HealthController {
    constructor(private readonly dataSource: DataSource) {}

    @Public()
    @Get()
    async check(): Promise<{ status: 'ok' }> {
        try {
            await this.dataSource.query('SELECT 1');
        } catch {
            throw new ServiceUnavailableException('Database unreachable');
        }
        return { status: 'ok' };
    }
}
