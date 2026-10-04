import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    const config = new DocumentBuilder()
        .setTitle('Crossliseu API')
        .setVersion('0.0.1')
        .addBearerAuth()
        .build();
    SwaggerModule.setup(
        'docs',
        app,
        () => SwaggerModule.createDocument(app, config),
        {
            jsonDocumentUrl: 'docs/json',
            swaggerOptions: { persistAuthorization: true },
        },
    );

    await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
