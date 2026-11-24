import { BeforeApplicationShutdown, Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import type { WebSocket } from 'ws';
import { Public } from '../auth/public-decorator.js';
import { FightAccessRegistry } from './fight-access.js';
import {
    FightCloseCode,
    MAX_CONCURRENT_CHECKS,
    MAX_FRAME_BYTES,
} from './fight-channel-protocol.js';
import { FightConnections } from './fight-connections.js';
import { FightSession, type FightSocket } from './fight-session.js';
import { FightStatePusher } from './fight-state-pusher.js';

/** How long shutdown waits for browsers to acknowledge the 1001 close before ws terminates them */
const SHUTDOWN_GRACE_MS = 1_000;

/**
 * The /fights WebSocket browsers follow a match on (docs/fight-channel-protocol.md). Each socket
 * gets a FightSession, which reads the raw frames itself: no @SubscribeMessage handlers, so the
 * global JwtAuthGuard never runs here (@Public() keeps it that way if handlers are added).
 */
@Public()
@WebSocketGateway({ path: '/fights', maxPayload: MAX_FRAME_BYTES })
export class FightChannelGateway
    implements OnGatewayConnection, BeforeApplicationShutdown
{
    private readonly logger = new Logger(FightChannelGateway.name);
    private readonly sockets = new Set<WebSocket>();
    private shuttingDown = false;
    private checksRunning = 0;

    constructor(
        private readonly access: FightAccessRegistry,
        private readonly connections: FightConnections,
        private readonly pusher: FightStatePusher,
    ) {}

    handleConnection(client: WebSocket): void {
        // The HTTP server still accepts upgrades while the app shuts down
        if (this.shuttingDown) {
            client.close(FightCloseCode.ServerShutdown, 'server_shutdown');
            return;
        }

        const socket: FightSocket = client;
        const session = new FightSession(socket, {
            verify: (credential) => this.access.verify(credential),
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
            subscribe: async (matchId, access, target) => {
                const { role } = access;
                // Registered first: a change that lands while the snapshot is read is pushed too
                this.connections.add(
                    matchId,
                    role,
                    target,
                    access.role === 'referee' ? access.name : null,
                );
                try {
                    const found = await this.pusher.sendSnapshot(
                        matchId,
                        role,
                        target,
                    );
                    if (!found) {
                        this.connections.remove(target);
                    }
                    return found;
                } catch (error) {
                    this.connections.remove(target);
                    throw error;
                }
            },
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
            this.connections.remove(socket);
        });
    }

    /** Closes every browser with 1001 (reconnect with backoff) and waits briefly for them to go */
    async beforeApplicationShutdown(): Promise<void> {
        this.shuttingDown = true;
        const closing = [...this.sockets].map(
            (client) =>
                new Promise<void>((resolve) => {
                    client.once('close', () => resolve());
                    client.close(
                        FightCloseCode.ServerShutdown,
                        'server_shutdown',
                    );
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
