import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { User } from '../users/entities/user.entity.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { LocalAuthGuard } from './local-auth.guard.js';
import { Public } from './public-decorator.js';

type AuthenticatedRequest = Request & {
    user: User;
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Public()
    @UseGuards(LocalAuthGuard)
    @ApiBody({ type: LoginDto })
    @Post('login')
    login(@Req() req: AuthenticatedRequest) {
        return this.authService.login(req.user);
    }
}
