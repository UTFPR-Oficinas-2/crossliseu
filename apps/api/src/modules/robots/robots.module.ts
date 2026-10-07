import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Robot } from './entities/robot.entity.js';
import { RobotsController } from './robots.controller.js';
import { RobotsService } from './robots.service.js';
import { RobotsRepository } from './robots.repository.js';
import { ChampionshipsModule } from '../championships/championships.module.js';

@Module({
    imports: [TypeOrmModule.forFeature([Robot]), ChampionshipsModule],
    controllers: [RobotsController],
    providers: [RobotsService, RobotsRepository],
    exports: [RobotsService],
})
export class RobotsModule {}
