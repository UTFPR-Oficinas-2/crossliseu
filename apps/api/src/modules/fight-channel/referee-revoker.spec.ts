import type { Logger } from '@nestjs/common';
import { FightEvents } from '../matches/fight/fight-events.js';
import type { FightService } from '../matches/fight/fight.service.js';
import { FightConnections } from './fight-connections.js';
import type { FightSocket } from './fight-session.js';
import { RefereeRevoker } from './referee-revoker.js';

const MATCH_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

class FakeSocket implements FightSocket {
    readyState = 1;
    send = vi.fn();
    close = vi.fn();
    ping = vi.fn();
    terminate = vi.fn();
}

function setup(closed: boolean | Error) {
    const connections = new FightConnections();
    const events = new FightEvents();
    const fight = {
        operatorState: vi.fn(() =>
            closed instanceof Error
                ? Promise.reject(closed)
                : Promise.resolve({ closed }),
        ),
    };
    const revoker = new RefereeRevoker(
        connections,
        fight as unknown as FightService,
        events,
    );
    const warn = vi.fn();
    revoker.logger = { warn } as unknown as Logger;
    revoker.onModuleInit();
    const referee = new FakeSocket();
    const operator = new FakeSocket();
    return { connections, events, fight, revoker, referee, operator, warn };
}

describe('RefereeRevoker', () => {
    it('closes referee sockets with 4001 when the match is closed', async () => {
        const { connections, revoker, referee, operator } = setup(true);
        connections.add(MATCH_ID, 'referee', referee);
        connections.add(MATCH_ID, 'operator', operator);

        await revoker.check(MATCH_ID);

        expect(referee.close).toHaveBeenCalledWith(4001, 'bad_credentials');
        expect(operator.close).not.toHaveBeenCalled();
    });

    it('leaves referee sockets open while not closed', async () => {
        const { connections, revoker, referee } = setup(false);
        connections.add(MATCH_ID, 'referee', referee);

        await revoker.check(MATCH_ID);

        expect(referee.close).not.toHaveBeenCalled();
    });

    it('skips matches with no referee subscriber', async () => {
        const { connections, revoker, fight, operator } = setup(true);
        connections.add(MATCH_ID, 'operator', operator);

        await revoker.check(MATCH_ID);

        expect(fight.operatorState).not.toHaveBeenCalled();
        expect(operator.close).not.toHaveBeenCalled();
    });

    it('checks on every fight change', async () => {
        const { connections, events, fight, referee } = setup(true);
        connections.add(MATCH_ID, 'referee', referee);

        events.emit({ matchId: MATCH_ID, arenaId: null });
        await vi.waitFor(() => expect(referee.close).toHaveBeenCalled());
        expect(fight.operatorState).toHaveBeenCalledWith(MATCH_ID);
    });

    it('a failing state read is logged and leaves the sockets open', async () => {
        const { connections, revoker, referee, warn } = setup(new Error('db'));
        connections.add(MATCH_ID, 'referee', referee);

        await expect(revoker.check(MATCH_ID)).resolves.toBeUndefined();

        expect(referee.close).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
    });

    it('stops listening on destroy', () => {
        const { connections, events, fight, revoker, referee } = setup(true);
        connections.add(MATCH_ID, 'referee', referee);
        revoker.onModuleDestroy();

        events.emit({ matchId: MATCH_ID, arenaId: null });

        expect(fight.operatorState).not.toHaveBeenCalled();
    });
});
