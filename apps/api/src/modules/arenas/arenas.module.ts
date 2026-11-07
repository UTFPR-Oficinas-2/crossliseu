import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Arena } from './entities/arena.entity.js';
import { ArenasController } from './arenas.controller.js';
import { ArenasService } from './arenas.service.js';
import { ArenasRepository } from './arenas.repository.js';

@Module({
    imports: [TypeOrmModule.forFeature([Arena])],
    controllers: [ArenasController],
    providers: [ArenasService, ArenasRepository],
    exports: [ArenasService],
})
export class ArenasModule {}
