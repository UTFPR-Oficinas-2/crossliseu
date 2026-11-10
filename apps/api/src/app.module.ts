import { Module } from '@nestjs/common';
import './config/env.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from './database/database.options.js';
import { MatchesModule } from './modules/matches/matches.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ChampionshipsModule } from './modules/championships/championships.module.js';
import { RobotsModule } from './modules/robots/robots.module.js';
import { ArenasModule } from './modules/arenas/arenas.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { RecordingsModule } from './modules/recordings/recordings.module.js';

@Module({
    imports: [
        TypeOrmModule.forRoot(databaseOptions()),
        MatchesModule,
        AuthModule,
        UsersModule,
        ChampionshipsModule,
        RobotsModule,
        ArenasModule,
        HealthModule,
        RecordingsModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule {}
