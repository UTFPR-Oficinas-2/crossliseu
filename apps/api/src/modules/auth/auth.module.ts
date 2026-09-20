import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UsersModule } from '../users/users.module.js';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from './local.strategy.js';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from './constants.js';
import { JwtStrategy } from './jwt.strategy.js';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Module({
    controllers: [AuthController],
    providers: [
        AuthService,
        LocalStrategy,
        JwtStrategy,
        {
            provide: APP_GUARD,
            useClass: JwtAuthGuard,
        },
    ],
    imports: [
        UsersModule,
        PassportModule.register({}),
        JwtModule.register({
            secret: jwtConstants.secret,
            signOptions: { expiresIn: '60s' },
        }),
    ],
})
export class AuthModule {}
