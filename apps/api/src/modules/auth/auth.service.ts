import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { User } from '../users/entities/user.entity.js';

@Injectable()
export class AuthService {
    constructor(private readonly usersService: UsersService) {}

    async validateUser(
        username: string,
        passwordHash: string,
    ): Promise<Partial<User> | null> {
        const user = await this.usersService.findByUsername(username);

        if (user && user.passwordHash == passwordHash) {
            const { passwordHash, ...result } = user;
            return result;
        }

        return null;
    }
}
