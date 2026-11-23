import { Injectable, type OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service.js';
import {
    FightAccessRegistry,
    type FightAccess,
    type FightAccessVerifier,
} from './fight-access.js';
import type { Auth } from './fight-channel-protocol.js';

/** The operator's login JWT; like JwtStrategy it also requires the user to still exist */
@Injectable()
export class JwtFightAccessVerifier
    implements FightAccessVerifier, OnModuleInit
{
    constructor(
        private readonly jwt: JwtService,
        private readonly users: UsersService,
        private readonly registry: FightAccessRegistry,
    ) {}

    onModuleInit(): void {
        this.registry.register(this);
    }

    async verify(credential: Auth): Promise<FightAccess | null> {
        let sub: string;
        try {
            ({ sub } = await this.jwt.verifyAsync<{ sub: string }>(
                credential.token,
            ));
        } catch {
            return null;
        }
        const user = await this.users.findById(sub);
        return user ? { role: 'operator', userId: user.id } : null;
    }
}
