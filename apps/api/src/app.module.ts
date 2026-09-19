import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import './config/env.js';
import { databaseOptions } from './database/database.options.js';
import { MatchesModule } from './modules/matches/matches.module.js';

@Module({
    imports: [TypeOrmModule.forRoot(databaseOptions()), MatchesModule],
    controllers: [],
    providers: [],
})
export class AppModule {}
