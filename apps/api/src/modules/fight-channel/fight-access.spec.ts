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

    it('skips a verifier that throws', async () => {
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
        vi.spyOn(registry['logger'], 'error').mockImplementation(() => {});
        expect(await registry.verify(cred)).toEqual({
            role: 'referee',
            name: 'x',
        });
    });
});
