import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { User } from '../users/entities/user.entity.js';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

/**
 * Compared against when the username is unknown, so a login takes as long whether or not the
 * user exists. Same cost as the admin seed's hashes.
 */
export const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

@Injectable()
export class AuthService {
    logger: Logger = new Logger(AuthService.name);

    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
    ) {}

    async validateUser(
        username: string,
        password: string,
    ): Promise<Partial<User> | null> {
        const user = await this.usersService.findByUsername(username);
        const matches = await bcrypt.compare(
            password,
            user?.password ?? DUMMY_HASH,
        );

        if (!user || !matches) {
            // The typed username is never logged: it is often a password typed in the wrong field
            this.logger.warn('login_failed');
            return null;
        }

        const { password: _password, ...result } = user;
        return result;
    }

    async login(user: User) {
        const payload = { username: user.username, sub: user.id };
        return {
            token: this.jwtService.sign(payload),
        };
    }
}
