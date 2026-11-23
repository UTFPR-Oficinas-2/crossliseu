import { Logger } from '@nestjs/common';
import {
    FightAccessRegistry,
    type FightAccess,
    type FightAccessVerifier,
} from './fight-access.js';

const cred = { matchId: 'm', token: 't', name: null };

describe('FightAccessRegistry', () => {
    it('returns the first non-null result, in registration order', async () => {
        const registry = new FightAccessRegistry();
        const referee: FightAccess = { role: 'referee', name: 'x' };
        registry.register({ verify: async () => null });
        registry.register({ verify: async () => referee });
        registry.register({
            verify: async () => ({ role: 'operator', userId: 'u' }),
        });
        expect(await registry.verify(cred)).toEqual(referee);
    });

    it('returns null with no verifiers', async () => {
        expect(await new FightAccessRegistry().verify(cred)).toBeNull();
    });

    it('still lets a later verifier accept after one throws', async () => {
        const registry = new FightAccessRegistry();
        const broken: FightAccessVerifier = {
            verify: async () => {
                throw new Error('boom');
            },
        };
        registry.register(broken);
        registry.register({
            verify: async () => ({ role: 'referee', name: 'x' }),
        });
        const logged = vi
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => {});
        expect(await registry.verify(cred)).toEqual({
            role: 'referee',
            name: 'x',
        });
        expect(logged).toHaveBeenCalled();
        logged.mockRestore();
    });

    it('rejects when a verifier threw and none accepted', async () => {
        const registry = new FightAccessRegistry();
        registry.register({
            verify: async () => {
                throw new Error('boom');
            },
        });
        registry.register({ verify: async () => null });
        const logged = vi
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => {});
        await expect(registry.verify(cred)).rejects.toThrow('boom');
        expect(logged).toHaveBeenCalled();
        logged.mockRestore();
    });
});
