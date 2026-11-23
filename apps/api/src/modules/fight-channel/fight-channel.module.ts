import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MatchesModule } from '../matches/matches.module.js';
import { UsersModule } from '../users/users.module.js';
import { FightAccessRegistry } from './fight-access.js';
import { FightChannelGateway } from './fight-channel.gateway.js';
import { FightConnections } from './fight-connections.js';
import { FightStatePusher } from './fight-state-pusher.js';
import { JwtFightAccessVerifier } from './jwt-fight-access.verifier.js';
import { RefereeFightAccessVerifier } from './referee-fight-access.verifier.js';

@Module({
    // One way only: MatchesModule must not import this module
    imports: [MatchesModule, AuthModule, UsersModule],
    providers: [
        FightAccessRegistry,
        JwtFightAccessVerifier,
        RefereeFightAccessVerifier,
        FightConnections,
        FightStatePusher,
        FightChannelGateway,
    ],
})
export class FightChannelModule {}
