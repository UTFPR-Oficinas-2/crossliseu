import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisModule } from '../analysis/analysis.module.js';
import { ChampionshipsModule } from '../championships/championships.module.js';
import { MatchesModule } from '../matches/matches.module.js';
import { AnalysisResultsService } from './analysis-results.service.js';
import { AnalysisTimeoutService } from './analysis-timeout.service.js';
import { MatchVideo } from './entities/match-video.entity.js';
import { MatchVideosRepository } from './match-videos.repository.js';
import { R2RecordingStorage, RecordingStorage } from './recording-storage.js';
import { RecordingsController } from './recordings.controller.js';
import { RecordingsService } from './recordings.service.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([MatchVideo]),
        MatchesModule,
        ChampionshipsModule,
        AnalysisModule,
    ],
    controllers: [RecordingsController],
    providers: [
        RecordingsService,
        AnalysisResultsService,
        AnalysisTimeoutService,
        MatchVideosRepository,
        { provide: RecordingStorage, useClass: R2RecordingStorage },
    ],
    exports: [MatchVideosRepository, RecordingStorage],
})
export class RecordingsModule {}
