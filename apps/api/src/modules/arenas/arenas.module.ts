import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Arena } from './entities/arena.entity.js';
import { ArenasController } from './arenas.controller.js';
import { ArenasService } from './arenas.service.js';
import { ArenasRepository } from './arenas.repository.js';
import { ArenaConnections } from './device/arena-connections.js';
import { ArenaGateway } from './device/arena.gateway.js';
import { ArenaStatePusher } from './device/arena-state-pusher.js';
import { MatchesModule } from '../matches/matches.module.js';

@Module({
    // One way only: MatchesModule must not import this module
    imports: [TypeOrmModule.forFeature([Arena]), MatchesModule],
    controllers: [ArenasController],
    providers: [
        ArenasService,
        ArenasRepository,
        ArenaConnections,
        ArenaGateway,
        ArenaStatePusher,
    ],
    exports: [ArenasService],
})
export class ArenasModule {}
