import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Championship } from './entities/championship.entity.js';
import { ChampionshipsController } from './championships.controller.js';
import { ChampionshipsService } from './championships.service.js';
import { ChampionshipsRepository } from './championships.repository.js';

@Module({
    imports: [TypeOrmModule.forFeature([Championship])],
    controllers: [ChampionshipsController],
    providers: [ChampionshipsService, ChampionshipsRepository],
    exports: [ChampionshipsService],
})
export class ChampionshipsModule {}
