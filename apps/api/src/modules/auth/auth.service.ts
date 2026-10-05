import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { User } from '../users/entities/user.entity.js';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
    ) {}

    async validateUser(
        username: string,
        password: string,
    ): Promise<Partial<User> | null> {
        let user: User;
        try {
            user = await this.usersService.findByUsername(username);
        } catch (error) {
            if (error instanceof NotFoundException) {
                return null;
            }
            throw error;
        }

        if (user && (await bcrypt.compare(password, user.password))) {
            const { password: _password, ...result } = user;
            return result;
        }

        return null;
    }

    async login(user: User) {
        const payload = { username: user.username, sub: user.id };
        return {
            token: this.jwtService.sign(payload),
        };
    }
}
