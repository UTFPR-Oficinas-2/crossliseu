import { Injectable, Logger } from '@nestjs/common';
import { User } from './entities/user.entity.js';
import { UsersRepository } from './users.repository.js';

/**
 * Users exist only for login. There is no sign-up and no user management API: the first user
 * comes from the admin seed (src/database/seeds/create-admin.seed.ts).
 */
@Injectable()
export class UsersService {
    logger: Logger = new Logger(UsersService.name);

    constructor(private readonly usersRepository: UsersRepository) {}

    /** Null when no live user has this username; the caller decides how to report it */
    findByUsername(username: string): Promise<User | null> {
        return this.usersRepository.findOneByUsername(username);
    }

    /** Null when no live user has this id */
    findById(id: string): Promise<User | null> {
        return this.usersRepository.findOneById(id);
    }
}
