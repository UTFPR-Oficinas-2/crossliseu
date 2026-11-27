import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChampionshipsModule } from '../championships/championships.module.js';
import { MatchEvent } from '../matches/entities/match-event.entity.js';
import { Match } from '../matches/entities/match.entity.js';
import { MatchesModule } from '../matches/matches.module.js';
import { RecordingsModule } from '../recordings/recordings.module.js';
import { ResultsController } from './results.controller.js';
import { ResultsRepository } from './results.repository.js';
import { ResultsService } from './results.service.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([Match, MatchEvent]),
        MatchesModule,
        ChampionshipsModule,
        RecordingsModule,
    ],
    controllers: [ResultsController],
    providers: [ResultsService, ResultsRepository],
})
export class ResultsModule {}
