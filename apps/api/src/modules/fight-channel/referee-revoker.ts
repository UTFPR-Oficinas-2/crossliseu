import {
    Injectable,
    Logger,
    type OnModuleDestroy,
    type OnModuleInit,
} from '@nestjs/common';
import { FightEvents } from '../matches/fight/fight-events.js';
import { FightService } from '../matches/fight/fight.service.js';
import { nameKey } from '../matches/referees/name-key.js';
import { RefereesService } from '../matches/referees/referees.service.js';
import { FightCloseCode } from './fight-channel-protocol.js';
import { FightConnections } from './fight-connections.js';

/**
 * The channel checks a credential only at `auth`, so a referee credential revoked later is
 * enforced here, on every change of a match with referee sockets: all of them are closed with
 * 4001 once the match has its `closed` event, and before Start a referee whose seat the operator
 * freed is closed too (seats can only be freed while `scheduled`). Operator sockets stay open.
 */
@Injectable()
export class RefereeRevoker implements OnModuleInit, OnModuleDestroy {
    logger: Logger = new Logger(RefereeRevoker.name);

    private unsubscribe: (() => void) | undefined;

    constructor(
        private readonly connections: FightConnections,
        private readonly fight: FightService,
        private readonly events: FightEvents,
        private readonly referees: RefereesService,
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
            const { closed, status } = await this.fight.operatorState(matchId);
            if (closed) {
                this.connections.closeRole(
                    matchId,
                    'referee',
                    FightCloseCode.BadCredentials,
                    'bad_credentials',
                );
                return;
            }
            if (status !== 'scheduled') {
                return;
            }
            const seated = new Set(
                (await this.referees.seatedNames(matchId)).map(nameKey),
            );
            this.connections.closeWhere(
                matchId,
                (s) =>
                    s.role !== 'referee' ||
                    (s.name !== null && seated.has(nameKey(s.name))),
                FightCloseCode.BadCredentials,
                'bad_credentials',
            );
        } catch (error) {
            this.logger.warn('referee_revoke_failed', {
                matchId,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
