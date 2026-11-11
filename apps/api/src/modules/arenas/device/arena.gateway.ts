import { BeforeApplicationShutdown, Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import type { WebSocket } from 'ws';
import { Public } from '../../auth/public-decorator.js';
import { ArenasService } from '../arenas.service.js';
import { FightService } from '../../matches/fight/fight.service.js';
import { ArenaConnections } from './arena-connections.js';
import {
    CloseCode,
    MAX_FRAME_BYTES,
    MAX_CONCURRENT_CHECKS,
} from './arena-protocol.js';
import { ArenaSession } from './arena-session.js';
import { ArenaStatePusher } from './arena-state-pusher.js';

/** How long shutdown waits for boxes to acknowledge the 1001 close before ws terminates them */
const SHUTDOWN_GRACE_MS = 1_000;

/**
 * The /arena WebSocket the arena boxes log in to (docs/arena-protocol.md). Each socket gets an
 * ArenaSession, which reads the raw frames itself: no @SubscribeMessage handlers, so the global
 * JwtAuthGuard never runs here (@Public() keeps it that way if handlers are added).
 */
@Public()
@WebSocketGateway({ path: '/arena', maxPayload: MAX_FRAME_BYTES })
export class ArenaGateway
    implements OnGatewayConnection, BeforeApplicationShutdown
{
    private readonly logger = new Logger(ArenaGateway.name);
    private readonly sockets = new Set<WebSocket>();
    private shuttingDown = false;
    private checksRunning = 0;

    constructor(
        private readonly arenasService: ArenasService,
        private readonly connections: ArenaConnections,
        private readonly pusher: ArenaStatePusher,
        private readonly fight: FightService,
    ) {}

    handleConnection(client: WebSocket): void {
        // The HTTP server still accepts upgrades while the app shuts down
        if (this.shuttingDown) {
            client.close(CloseCode.ServerShutdown, 'server_shutdown');
            return;
        }

        const session = new ArenaSession(client, {
            authenticate: (deviceId, token) =>
                this.arenasService.authenticateDevice(deviceId, token),
            connections: this.connections,
            checks: {
                acquire: () => {
                    if (this.checksRunning >= MAX_CONCURRENT_CHECKS) {
                        return false;
                    }
                    this.checksRunning++;
                    return true;
                },
                release: () => {
                    this.checksRunning--;
                },
            },
            logger: this.logger,
            pushState: (arenaId) => this.pusher.push(arenaId),
            surrender: (arenaId, matchId, side) =>
                this.fight.surrender(arenaId, matchId, side),
        });
        this.sockets.add(client);

        client.on('message', (data, isBinary) => {
            // ws hands text frames over as a Buffer (binaryType 'nodebuffer'); null means binary
            const text =
                !isBinary && Buffer.isBuffer(data)
                    ? data.toString('utf8')
                    : null;
            void session.onMessage(text);
        });
        client.on('pong', () => session.onPong());
        client.once('close', () => {
            this.sockets.delete(client);
            session.onClose();
        });
    }

    /** Closes every box with 1001 (reconnect with backoff) and waits briefly for them to go */
    async beforeApplicationShutdown(): Promise<void> {
        this.shuttingDown = true;
        const closing = [...this.sockets].map(
            (client) =>
                new Promise<void>((resolve) => {
                    client.once('close', () => resolve());
                    client.close(CloseCode.ServerShutdown, 'server_shutdown');
                }),
        );
        if (closing.length === 0) {
            return;
        }
        let grace: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
            Promise.all(closing),
            new Promise((resolve) => {
                grace = setTimeout(resolve, SHUTDOWN_GRACE_MS);
            }),
        ]);
        clearTimeout(grace);
    }
}
