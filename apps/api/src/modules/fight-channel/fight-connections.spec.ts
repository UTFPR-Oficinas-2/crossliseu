import { FightConnections } from './fight-connections.js';
import type { FightSocket } from './fight-session.js';

class FakeSocket implements FightSocket {
    readyState = 1;
    send = vi.fn();
    close = vi.fn();
    ping = vi.fn();
    terminate = vi.fn();
}

function fakeSocket(): FakeSocket {
    return new FakeSocket();
}

describe('FightConnections', () => {
    let connections: FightConnections;

    beforeEach(() => {
        connections = new FightConnections();
    });

    it('lists the subscribers of a match with their roles', () => {
        const a = fakeSocket();
        const b = fakeSocket();
        const other = fakeSocket();
        connections.add('m1', 'referee', a);
        connections.add('m1', 'operator', b);
        connections.add('m2', 'referee', other);

        expect(connections.subscribers('m1')).toEqual([
            { role: 'referee', socket: a },
            { role: 'operator', socket: b },
        ]);
        expect(connections.hasSubscribers('m1')).toBe(true);
        expect(connections.hasSubscribers('m3')).toBe(false);
        expect(connections.subscribers('m3')).toEqual([]);
    });

    it('remove forgets the socket and the match once empty', () => {
        const a = fakeSocket();
        connections.add('m1', 'referee', a);

        connections.remove(a);

        expect(connections.hasSubscribers('m1')).toBe(false);
        expect(connections.subscribers('m1')).toEqual([]);
    });

    it('remove of an unknown socket is a no-op', () => {
        const a = fakeSocket();
        connections.add('m1', 'referee', a);

        expect(() => connections.remove(fakeSocket())).not.toThrow();

        expect(connections.subscribers('m1')).toHaveLength(1);
    });

    it('closeMatch closes only that match and forgets its sockets', () => {
        const a = fakeSocket();
        const b = fakeSocket();
        const other = fakeSocket();
        connections.add('m1', 'referee', a);
        connections.add('m1', 'operator', b);
        connections.add('m2', 'referee', other);

        connections.closeMatch('m1', 4005, 'match_not_found');

        expect(a.close).toHaveBeenCalledWith(4005, 'match_not_found');
        expect(b.close).toHaveBeenCalledWith(4005, 'match_not_found');
        expect(other.close).not.toHaveBeenCalled();
        expect(connections.hasSubscribers('m1')).toBe(false);
        expect(connections.hasSubscribers('m2')).toBe(true);
    });

    it('closeMatch keeps going when a socket throws on close', () => {
        const a = fakeSocket();
        const b = fakeSocket();
        a.close.mockImplementation(() => {
            throw new Error('boom');
        });
        connections.add('m1', 'referee', a);
        connections.add('m1', 'referee', b);

        connections.closeMatch('m1', 4005, 'match_not_found');

        expect(b.close).toHaveBeenCalled();
        expect(connections.hasSubscribers('m1')).toBe(false);
    });

    it("closeRole closes only that role's sockets of the match", () => {
        const referee = fakeSocket();
        const operator = fakeSocket();
        const elsewhere = fakeSocket();
        connections.add('m1', 'referee', referee);
        connections.add('m1', 'operator', operator);
        connections.add('m2', 'referee', elsewhere);

        connections.closeRole('m1', 'referee', 4001, 'bad_credentials');

        expect(referee.close).toHaveBeenCalledWith(4001, 'bad_credentials');
        expect(operator.close).not.toHaveBeenCalled();
        expect(elsewhere.close).not.toHaveBeenCalled();
        expect(connections.subscribers('m1')).toEqual([
            { role: 'operator', socket: operator },
        ]);
    });

    it('closeRole keeps going when one socket throws on close', () => {
        const broken = fakeSocket();
        broken.close.mockImplementation(() => {
            throw new Error('gone');
        });
        const next = fakeSocket();
        connections.add('m1', 'referee', broken);
        connections.add('m1', 'referee', next);

        connections.closeRole('m1', 'referee', 4001, 'bad_credentials');

        expect(next.close).toHaveBeenCalled();
        expect(connections.hasSubscribers('m1')).toBe(false);
    });
});
