import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Championship } from './entities/championship.entity.js';
import { Repository } from 'typeorm';

@Injectable()
export class ChampionshipsRepository {
    constructor(
        @InjectRepository(Championship)
        private readonly repository: Repository<Championship>,
    ) {}

    create(championship: Championship): Promise<Championship> {
        return this.repository.save(championship);
    }

    findAll(): Promise<Championship[]> {
        return this.repository.find();
    }

    findOne(id: string): Promise<Championship | null> {
        return this.repository.findOneBy({ id });
    }

    update(id: string, partialChampionship: Partial<Championship>) {
        return this.repository.update({ id }, partialChampionship);
    }

    remove(id: string) {
        return this.repository.softDelete({ id });
    }
}
