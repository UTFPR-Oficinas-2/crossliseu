import { INestApplication, ValidationPipe } from '@nestjs/common';

/** App-wide setup shared by main.ts and the e2e tests */
export function configureApp(app: INestApplication): void {
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );
}
