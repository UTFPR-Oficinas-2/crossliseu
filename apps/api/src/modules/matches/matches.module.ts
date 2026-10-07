import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Match } from './entities/match.entity.js';
import { MatchesController } from './matches.controller.js';
import { MatchesService } from './matches.service.js';
import { MatchesRepository } from './matches.repository.js';
import { ChampionshipsModule } from '../championships/championships.module.js';
import { RobotsModule } from '../robots/robots.module.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([Match]),
        ChampionshipsModule,
        RobotsModule,
    ],
    controllers: [MatchesController],
    providers: [MatchesService, MatchesRepository],
    exports: [MatchesService],
})
export class MatchesModule {}
