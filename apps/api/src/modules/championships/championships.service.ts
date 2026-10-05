import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
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
        const { name, startDate, endDate } = createChampionshipDto;

        this.assertValidDateRange(startDate, endDate);

        const championship: Championship = new Championship(
            name,
            startDate,
            endDate,
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
        const championship = await this.findOne(id);

        this.assertValidDateRange(
            updateChampionshipDto.startDate ?? championship.startDate,
            updateChampionshipDto.endDate ?? championship.endDate,
        );

        await this.championshipsRepository.update(id, updateChampionshipDto);

        return this.findOne(id);
    }

    async remove(id: string) {
        await this.findOne(id);
        await this.championshipsRepository.remove(id);
    }

    private assertValidDateRange(startDate: Date, endDate: Date) {
        if (endDate < startDate) {
            this.logger.error('championship_end_before_start', {
                startDate,
                endDate,
            });
            throw new BadRequestException('championship_end_before_start');
        }
    }
}
