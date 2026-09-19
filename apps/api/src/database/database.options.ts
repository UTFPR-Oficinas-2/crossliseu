import { DataSourceOptions } from 'typeorm';
import { fileURLToPath } from 'node:url';
import { Match } from '../modules/matches/entities/match.entity.js';

export function databaseOptions(): DataSourceOptions {
    const db: string = String(process.env.POSTGRES_DB);
    const username: string = String(process.env.POSTGRES_USER);
    const port: number = Number(process.env.POSTGRES_PORT);
    const host: string = String(process.env.POSTGRES_HOST);
    const password: string = String(process.env.POSTGRES_PASSWORD);

    const allSet: boolean = db && username && port && host ? true : false;

    if (!allSet) {
        throw new Error('PostgreSQL environment variables are required');
    }

    return {
        type: 'postgres',
        host: host,
        port: port,
        username: username,
        password: password,
        database: db,
        entities: [Match],
        migrations: [
            fileURLToPath(new URL('./migrations/*{.ts,.js}', import.meta.url)),
        ],
        synchronize: false,
        migrationsRun: false,
    };
}
