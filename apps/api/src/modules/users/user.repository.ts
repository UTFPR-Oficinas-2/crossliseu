import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity.js';
import { Repository } from 'typeorm';

@Injectable()
export class MatchesRepository {
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

    findOne(id: string): Promise<User | null> {
        return this.repository.findOneBy({ id });
    }

    update() {
        // TODO
    }

    remove() {
        // TODO
    }
}
