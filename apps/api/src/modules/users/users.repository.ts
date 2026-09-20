import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity.js';
import { Repository, UpdateResult } from 'typeorm';
import { Match } from '../matches/entities/match.entity.js';

@Injectable()
export class UsersRepository {
    constructor(
        @InjectRepository(User)
        private readonly repository: Repository<User>,
    ) {}

    create(user: User) {
        return this.repository.save(user);
    }

    findAll() {
        return this.repository.find();
    }

    findOneById(id: string): Promise<User | null> {
        return this.repository.findOneBy({ id });
    }

    findOneByUsername(username: string): Promise<User | null> {
        return this.repository.findOneBy({ username });
    }

    update(id: string, partialUser: Partial<Match>): Promise<UpdateResult> {
        return this.repository.update({ id }, partialUser);
    }

    delete(id: string) {
        return this.repository.softDelete({ id });
    }
}
