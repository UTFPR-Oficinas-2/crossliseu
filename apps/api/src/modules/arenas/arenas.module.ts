import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Arena } from './entities/arena.entity.js';
import { ArenasController } from './arenas.controller.js';
import { ArenasService } from './arenas.service.js';
import { ArenasRepository } from './arenas.repository.js';
import { ArenaConnections } from './device/arena-connections.js';

@Module({
    imports: [TypeOrmModule.forFeature([Arena])],
    controllers: [ArenasController],
    providers: [ArenasService, ArenasRepository, ArenaConnections],
    exports: [ArenasService],
})
export class ArenasModule {}
