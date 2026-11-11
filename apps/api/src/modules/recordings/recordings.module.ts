import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChampionshipsModule } from '../championships/championships.module.js';
import { MatchesModule } from '../matches/matches.module.js';
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
    ],
    controllers: [RecordingsController],
    providers: [
        RecordingsService,
        MatchVideosRepository,
        { provide: RecordingStorage, useClass: R2RecordingStorage },
    ],
})
export class RecordingsModule {}
