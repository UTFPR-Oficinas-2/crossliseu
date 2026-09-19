import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Match } from './entities/match.entity.js';
import { MatchesController } from './matches.controller.js';
import { MatchesService } from './matches.service.js';
import { MatchesRepository } from './matches.repository.js';

@Module({
    imports: [TypeOrmModule.forFeature([Match])],
    controllers: [MatchesController],
    providers: [MatchesService, MatchesRepository],
    exports: [MatchesService],
})
export class MatchesModule {}
