import { Injectable, type OnModuleInit } from '@nestjs/common';
import { RefereesService } from '../matches/referees/referees.service.js';
import {
    FightAccessRegistry,
    type FightAccess,
    type FightAccessVerifier,
} from './fight-access.js';
import type { Auth } from './fight-channel-protocol.js';

/**
 * A referee's shared token and name. The referee joins over HTTP first (POST /referee/join):
 * this only checks that the name holds a seat on `matchId`, it never seats anybody.
 */
@Injectable()
export class RefereeFightAccessVerifier
    implements FightAccessVerifier, OnModuleInit
{
    constructor(
        private readonly referees: RefereesService,
        private readonly registry: FightAccessRegistry,
    ) {}

    onModuleInit(): void {
        this.registry.register(this);
    }

    async verify(credential: Auth): Promise<FightAccess | null> {
        if (credential.name === null) {
            return null;
        }
        const seat = await this.referees.resolve(
            credential.token,
            credential.name,
        );
        // The token belongs to one match: it must not open another one's channel
        if (!seat || seat.matchId !== credential.matchId) {
            return null;
        }
        return { role: 'referee', name: credential.name };
    }
}
