import type { PostgresDataSourceOptions } from 'typeorm/driver/postgres/PostgresDataSourceOptions.js';
import { Arena } from '../modules/arenas/entities/arena.entity.js';
import { Match } from '../modules/matches/entities/match.entity.js';
import { User } from '../modules/users/entities/user.entity.js';
import { Championship } from '../modules/championships/entities/championship.entity.js';
import { Robot } from '../modules/robots/entities/robot.entity.js';
import { MatchEvent } from '../modules/matches/entities/match-event.entity.js';
import { MatchVideo } from '../modules/recordings/entities/match-video.entity.js';

export function databaseOptions(): PostgresDataSourceOptions {
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
        entities: [
            Arena,
            Match,
            User,
            Championship,
            Robot,
            MatchEvent,
            MatchVideo,
        ],
        // Migrations are listed only by the CLI data source (data-source.ts): the app never runs
        // them, and TypeORM would import every migration file on each connection otherwise
        synchronize: false,
        migrationsRun: false,
    };
}
