import { Module } from '@nestjs/common';
import './config/env.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from './database/database.options.js';
import { MatchesModule } from './modules/matches/matches.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
    imports: [
        TypeOrmModule.forRoot(databaseOptions()),
        MatchesModule,
        AuthModule,
        UsersModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule {}
