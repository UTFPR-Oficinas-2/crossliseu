import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Arena } from './entities/arena.entity.js';

@Injectable()
export class ArenasRepository {
    constructor(
        @InjectRepository(Arena)
        private readonly repository: Repository<Arena>,
    ) {}

    findAll(): Promise<Arena[]> {
        // Creation order keeps the operator's arena list stable
        return this.repository.find({ order: { createdAt: 'ASC' } });
    }

    findOne(id: string): Promise<Arena | null> {
        return this.repository.findOneBy({ id });
    }
}
