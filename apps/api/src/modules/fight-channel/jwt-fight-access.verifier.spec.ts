import type { JwtService } from '@nestjs/jwt';
import type { UsersService } from '../users/users.service.js';
import { FightAccessRegistry } from './fight-access.js';
import { JwtFightAccessVerifier } from './jwt-fight-access.verifier.js';

const cred = { matchId: 'm', token: 'tok', name: null };

function build(opts: { invalid?: boolean; user?: unknown }) {
    const jwt = {
        verifyAsync: vi.fn(async () => {
            if (opts.invalid) throw new Error('jwt expired');
            return { sub: 'u1' };
        }),
    };
    const users = { findById: vi.fn(async () => opts.user ?? null) };
    const registry = new FightAccessRegistry();
    const verifier = new JwtFightAccessVerifier(
        jwt as unknown as JwtService,
        users as unknown as UsersService,
        registry,
    );
    return { verifier, jwt, users, registry };
}

describe('JwtFightAccessVerifier', () => {
    it('returns the operator for a valid token and existing user', async () => {
        const { verifier, jwt, users } = build({ user: { id: 'u1' } });
        expect(await verifier.verify(cred)).toEqual({
            role: 'operator',
            userId: 'u1',
        });
        expect(jwt.verifyAsync).toHaveBeenCalledWith('tok');
        expect(users.findById).toHaveBeenCalledWith('u1');
    });

    it('returns null for an invalid or expired token', async () => {
        const { verifier, users } = build({ invalid: true });
        expect(await verifier.verify(cred)).toBeNull();
        expect(users.findById).not.toHaveBeenCalled();
    });

    it('returns null when the user no longer exists', async () => {
        const { verifier } = build({ user: null });
        expect(await verifier.verify(cred)).toBeNull();
    });

    it('registers itself on module init', async () => {
        const { verifier, registry } = build({ user: { id: 'u1' } });
        verifier.onModuleInit();
        expect(await registry.verify(cred)).toEqual({
            role: 'operator',
            userId: 'u1',
        });
    });
});
