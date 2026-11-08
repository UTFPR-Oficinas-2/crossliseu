import { ArenaConnections, type DeviceSocket } from './arena-connections.js';

function socket(): DeviceSocket {
    return {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        ping: vi.fn(),
        terminate: vi.fn(),
    };
}

describe('ArenaConnections', () => {
    it('claim returns undefined for the first socket and marks the arena online', () => {
        const connections = new ArenaConnections();

        expect(connections.claim('a1', socket())).toBeUndefined();
        expect(connections.isOnline('a1')).toBe(true);
    });

    it('claim by a second socket returns the first', () => {
        const connections = new ArenaConnections();
        const first = socket();
        connections.claim('a1', first);

        expect(connections.claim('a1', socket())).toBe(first);
        expect(connections.isOnline('a1')).toBe(true);
    });

    it('release by a replaced socket keeps the new one', () => {
        const connections = new ArenaConnections();
        const first = socket();
        const second = socket();
        connections.claim('a1', first);
        connections.claim('a1', second);

        connections.release('a1', first);

        expect(connections.isOnline('a1')).toBe(true);
        // still held by the second socket
        expect(connections.claim('a1', socket())).toBe(second);
    });

    it('release by the live socket marks the arena offline', () => {
        const connections = new ArenaConnections();
        const live = socket();
        connections.claim('a1', live);

        connections.release('a1', live);

        expect(connections.isOnline('a1')).toBe(false);
    });

    it('keeps arenas independent', () => {
        const connections = new ArenaConnections();
        const live = socket();
        connections.claim('a1', live);

        expect(connections.isOnline('a2')).toBe(false);
        expect(connections.claim('a2', socket())).toBeUndefined();
        connections.release('a2', live);
        expect(connections.isOnline('a2')).toBe(true);
        expect(connections.isOnline('a1')).toBe(true);
    });

    it('drop closes the live socket and marks the arena offline', () => {
        const connections = new ArenaConnections();
        const close = vi.fn();
        connections.claim('a1', { ...socket(), close });

        connections.drop('a1', 4001, 'bad_credentials');

        expect(close).toHaveBeenCalledWith(4001, 'bad_credentials');
        expect(connections.isOnline('a1')).toBe(false);
    });

    it('drop without a connection does nothing', () => {
        const connections = new ArenaConnections();

        expect(() =>
            connections.drop('a1', 4001, 'bad_credentials'),
        ).not.toThrow();
        expect(connections.isOnline('a1')).toBe(false);
    });

    it('reports a drop that happened after a revision was read', () => {
        const connections = new ArenaConnections();
        const seen = connections.revision();

        connections.drop('a1', 4001, 'bad_credentials');

        expect(connections.revokedSince('a1', seen)).toBe(true);
        expect(connections.revokedSince('a2', seen)).toBe(false);
        expect(connections.revokedSince('a1', connections.revision())).toBe(
            false,
        );
    });
});
