import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { User } from '../users/entities/user.entity.js';
import { JwtService } from '@nestjs/jwt';

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
        const user = await this.usersService.findByUsername(username);

        if (user && user.password == password) {
            const { password, ...result } = user;
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
