import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UsersModule } from '../users/users.module.js';

@Module({
    controllers: [AuthController],
    providers: [AuthService],
    imports: [UsersModule],
})
export class AuthModule {}
