import { Injectable, Logger } from '@nestjs/common';
import type { Auth } from './fight-channel-protocol.js';

export type FightAccess =
    { role: 'operator'; userId: string } | { role: 'referee'; name: string };

/** Turns the credential of an `auth` into an access, or null when it doesn't recognise it */
export interface FightAccessVerifier {
    verify(credential: Auth): Promise<FightAccess | null>;
}

@Injectable()
export class FightAccessRegistry {
    private readonly logger = new Logger(FightAccessRegistry.name);
    private readonly verifiers: FightAccessVerifier[] = [];

    register(verifier: FightAccessVerifier): void {
        this.verifiers.push(verifier);
    }

    /** First non-null wins; a verifier that throws is skipped so it can't lock out the others */
    async verify(credential: Auth): Promise<FightAccess | null> {
        for (const verifier of this.verifiers) {
            try {
                const access = await verifier.verify(credential);
                if (access) return access;
            } catch (error) {
                this.logger.error(
                    'A fight access verifier threw',
                    error instanceof Error ? error.stack : String(error),
                );
            }
        }
        return null;
    }
}
