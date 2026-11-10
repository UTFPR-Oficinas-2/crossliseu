import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Match } from './entities/match.entity.js';
import { MatchEvent } from './entities/match-event.entity.js';
import { Clock, SystemClock } from './fight/clock.js';
import { FightRepository } from './fight/fight.repository.js';
import { FightService } from './fight/fight.service.js';
import { MatchesController } from './matches.controller.js';
import { MatchesService } from './matches.service.js';
import { MatchesRepository } from './matches.repository.js';
import { ChampionshipsModule } from '../championships/championships.module.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([Match, MatchEvent]),
        ChampionshipsModule,
    ],
    controllers: [MatchesController],
    providers: [
        MatchesService,
        MatchesRepository,
        FightRepository,
        FightService,
        { provide: Clock, useClass: SystemClock },
    ],
    exports: [MatchesService],
})
export class MatchesModule {}
