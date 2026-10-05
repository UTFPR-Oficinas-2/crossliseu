import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import {
    ChampionshipCounts,
    ChampionshipsRepository,
} from './championships.repository.js';
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

    async findAll() {
        return this.withCounts(await this.championshipsRepository.findAll());
    }

    async findOne(id: string) {
        const [championship] = await this.withCounts([
            await this.findEntity(id),
        ]);
        return championship;
    }

    private async findEntity(id: string) {
        const championship = await this.championshipsRepository.findOne(id);

        if (!championship) {
            this.logger.error('championship_not_found', { id: id });
            throw new NotFoundException('championship_not_found');
        }

        return championship;
    }

    async update(id: string, updateChampionshipDto: UpdateChampionshipDto) {
        const championship = await this.findEntity(id);

        this.assertValidDateRange(
            updateChampionshipDto.startDate ?? championship.startDate,
            updateChampionshipDto.endDate ?? championship.endDate,
        );

        await this.championshipsRepository.update(id, updateChampionshipDto);

        return this.findOne(id);
    }

    async remove(id: string) {
        await this.findEntity(id);
        await this.championshipsRepository.remove(id);
    }

    private async withCounts(
        championships: Championship[],
    ): Promise<(Championship & ChampionshipCounts)[]> {
        const counts = await this.championshipsRepository.countRobotsAndMatches(
            championships.map((championship) => championship.id),
        );

        return championships.map((championship) =>
            Object.assign(
                championship,
                counts.get(championship.id) ?? {
                    robotCount: 0,
                    fightsTotal: 0,
                    fightsDone: 0,
                },
            ),
        );
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
