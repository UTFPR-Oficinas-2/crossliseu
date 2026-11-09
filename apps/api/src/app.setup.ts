import { INestApplication, ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';

/** App-wide setup shared by main.ts and the e2e tests */
export function configureApp(app: INestApplication): void {
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );
    // Plain WebSockets (ws) for the arena boxes on /arena
    app.useWebSocketAdapter(new WsAdapter(app));
}
