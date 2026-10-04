import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChampionshipsRepository } from './championships.repository.js';
import { Championship } from './entities/championship.entity.js';
import { CreateChampionshipDto } from './dto/create-championship.dto.js';
import { UpdateChampionshipDto } from './dto/update-championship.dto.js';

@Injectable()
export class ChampionshipsService {
    logger: Logger = new Logger(ChampionshipsService.name);

    constructor(
        private readonly championshipsRepository: ChampionshipsRepository,
    ) {}

    create(createChampionshipDto: CreateChampionshipDto) {
        const { name, scheduledDate } = createChampionshipDto;

        const championship: Championship = new Championship(
            name,
            scheduledDate ?? null,
        );

        return this.championshipsRepository.create(championship);
    }

    findAll() {
        return this.championshipsRepository.findAll();
    }

    async findOne(id: string) {
        const championship = await this.championshipsRepository.findOne(id);

        if (!championship) {
            this.logger.error('championship_not_found', { id: id });
            throw new NotFoundException('championship_not_found');
        }

        return championship;
    }

    async update(id: string, updateChampionshipDto: UpdateChampionshipDto) {
        await this.findOne(id);
        await this.championshipsRepository.update(id, updateChampionshipDto);

        return this.findOne(id);
    }

    async remove(id: string) {
        await this.findOne(id);
        await this.championshipsRepository.remove(id);
    }
}
