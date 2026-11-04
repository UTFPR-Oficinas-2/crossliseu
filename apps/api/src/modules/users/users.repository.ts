import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';

@Injectable()
export class UsersRepository {
    constructor(
        @InjectRepository(User)
        private readonly repository: Repository<User>,
    ) {}

    /** The live (not soft-deleted) user with exactly this username */
    findOneByUsername(username: string): Promise<User | null> {
        return this.repository.findOneBy({ username });
    }
}
