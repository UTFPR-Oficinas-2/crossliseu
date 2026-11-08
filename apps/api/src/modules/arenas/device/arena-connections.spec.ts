import { ArenaConnections, type DeviceSocket } from './arena-connections.js';

function socket(): DeviceSocket {
    return {
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
});
