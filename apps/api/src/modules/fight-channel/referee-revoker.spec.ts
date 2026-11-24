import type { Logger } from '@nestjs/common';
import { FightEvents } from '../matches/fight/fight-events.js';
import type { FightService } from '../matches/fight/fight.service.js';
import type { RefereesService } from '../matches/referees/referees.service.js';
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

function setup(
    closed: boolean | Error,
    {
        status = 'ongoing',
        seated = [] as string[],
    }: { status?: string; seated?: string[] } = {},
) {
    const connections = new FightConnections();
    const events = new FightEvents();
    const fight = {
        operatorState: vi.fn(() =>
            closed instanceof Error
                ? Promise.reject(closed)
                : Promise.resolve({ closed, status }),
        ),
    };
    const referees = {
        seatedNames: vi.fn(() => Promise.resolve(seated)),
    };
    const revoker = new RefereeRevoker(
        connections,
        fight as unknown as FightService,
        events,
        referees as unknown as RefereesService,
    );
    const warn = vi.fn();
    revoker.logger = { warn } as unknown as Logger;
    revoker.onModuleInit();
    const referee = new FakeSocket();
    const operator = new FakeSocket();
    return {
        connections,
        events,
        fight,
        referees,
        revoker,
        referee,
        operator,
        warn,
    };
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

    it('closes a referee whose seat was freed before Start', async () => {
        const { connections, revoker } = setup(false, {
            status: 'scheduled',
            seated: ['Ana', 'Bia'],
        });
        const ana = new FakeSocket();
        const bia = new FakeSocket();
        const ze = new FakeSocket();
        connections.add(MATCH_ID, 'referee', ana, 'Ana');
        connections.add(MATCH_ID, 'referee', bia, 'Bia');
        connections.add(MATCH_ID, 'referee', ze, 'Zé');

        await revoker.check(MATCH_ID);

        expect(ze.close).toHaveBeenCalledWith(4001, 'bad_credentials');
        expect(ana.close).not.toHaveBeenCalled();
        expect(bia.close).not.toHaveBeenCalled();
    });

    it('matches seated names ignoring case and accents', async () => {
        const { connections, revoker, referee } = setup(false, {
            status: 'scheduled',
            seated: ['João'],
        });
        connections.add(MATCH_ID, 'referee', referee, 'joao');

        await revoker.check(MATCH_ID);

        expect(referee.close).not.toHaveBeenCalled();
    });

    it('does not read seats once the fight has started', async () => {
        const { connections, revoker, referees, referee } = setup(false, {
            status: 'ongoing',
        });
        connections.add(MATCH_ID, 'referee', referee, 'Ana');

        await revoker.check(MATCH_ID);

        expect(referees.seatedNames).not.toHaveBeenCalled();
        expect(referee.close).not.toHaveBeenCalled();
    });

    it('leaves operator sockets open when a seat is freed', async () => {
        const { connections, revoker, referee, operator } = setup(false, {
            status: 'scheduled',
            seated: [],
        });
        connections.add(MATCH_ID, 'referee', referee, 'Zé');
        connections.add(MATCH_ID, 'operator', operator);

        await revoker.check(MATCH_ID);

        expect(referee.close).toHaveBeenCalledWith(4001, 'bad_credentials');
        expect(operator.close).not.toHaveBeenCalled();
    });
});
