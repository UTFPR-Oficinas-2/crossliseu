import type { RefereesService } from '../matches/referees/referees.service.js';
import { FightAccessRegistry } from './fight-access.js';
import { RefereeFightAccessVerifier } from './referee-fight-access.verifier.js';

const MATCH_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function build(seat: { matchId: string; seat: 1 | 2 | 3 } | null) {
    const referees = { resolve: vi.fn(() => Promise.resolve(seat)) };
    const registry = new FightAccessRegistry();
    const verifier = new RefereeFightAccessVerifier(
        referees as unknown as RefereesService,
        registry,
    );
    return { verifier, referees, registry };
}

describe('RefereeFightAccessVerifier', () => {
    it('returns null without a name', async () => {
        const { verifier, referees } = build({ matchId: MATCH_ID, seat: 1 });

        expect(
            await verifier.verify({
                matchId: MATCH_ID,
                token: 't',
                name: null,
            }),
        ).toBeNull();
        expect(referees.resolve).not.toHaveBeenCalled();
    });

    it('returns null for an unknown token', async () => {
        const { verifier, referees } = build(null);

        expect(
            await verifier.verify({
                matchId: MATCH_ID,
                token: 't',
                name: 'Ana',
            }),
        ).toBeNull();
        expect(referees.resolve).toHaveBeenCalledWith('t', 'Ana');
    });

    it('refuses a seated referee for another match', async () => {
        const { verifier } = build({ matchId: 'other', seat: 1 });

        expect(
            await verifier.verify({
                matchId: MATCH_ID,
                token: 't',
                name: 'Ana',
            }),
        ).toBeNull();
    });

    it('accepts a seated referee for its match', async () => {
        const { verifier } = build({ matchId: MATCH_ID, seat: 2 });

        expect(
            await verifier.verify({
                matchId: MATCH_ID,
                token: 't',
                name: 'Ana',
            }),
        ).toEqual({ role: 'referee', name: 'Ana' });
    });

    it('registers itself with the registry', async () => {
        const { verifier, registry } = build({ matchId: MATCH_ID, seat: 1 });

        verifier.onModuleInit();

        expect(
            await registry.verify({
                matchId: MATCH_ID,
                token: 't',
                name: 'Ana',
            }),
        ).toEqual({ role: 'referee', name: 'Ana' });
    });
});
