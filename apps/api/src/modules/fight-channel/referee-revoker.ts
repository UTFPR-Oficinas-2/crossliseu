import {
    Injectable,
    Logger,
    type OnModuleDestroy,
    type OnModuleInit,
} from '@nestjs/common';
import { FightEvents } from '../matches/fight/fight-events.js';
import { FightService } from '../matches/fight/fight.service.js';
import { FightCloseCode } from './fight-channel-protocol.js';
import { FightConnections } from './fight-connections.js';

/**
 * The channel checks a credential only at `auth`, and a referee token stops working once the
 * fight is confirmed: on every change of a match with referee sockets, this closes them with
 * 4001 once the match has its `closed` event. Operator sockets stay open.
 */
@Injectable()
export class RefereeRevoker implements OnModuleInit, OnModuleDestroy {
    logger: Logger = new Logger(RefereeRevoker.name);

    private unsubscribe: (() => void) | undefined;

    constructor(
        private readonly connections: FightConnections,
        private readonly fight: FightService,
        private readonly events: FightEvents,
    ) {}

    onModuleInit(): void {
        this.unsubscribe = this.events.onChange((change) => {
            void this.check(change.matchId);
        });
    }

    onModuleDestroy(): void {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
    }

    /** Never rejects: a failure is only logged, and the sockets stay open until the next change */
    async check(matchId: string): Promise<void> {
        const hasReferee = this.connections
            .subscribers(matchId)
            .some((s) => s.role === 'referee');
        if (!hasReferee) {
            return;
        }
        try {
            const { closed } = await this.fight.operatorState(matchId);
            if (closed) {
                this.connections.closeRole(
                    matchId,
                    'referee',
                    FightCloseCode.BadCredentials,
                    'bad_credentials',
                );
            }
        } catch (error) {
            this.logger.warn('referee_revoke_failed', {
                matchId,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
