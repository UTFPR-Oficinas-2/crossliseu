import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
} from '@nestjs/common';
import { ChampionshipsService } from './championships.service.js';
import { CreateChampionshipDto } from './dto/create-championship.dto.js';
import { UpdateChampionshipDto } from './dto/update-championship.dto.js';
import { Public } from '../auth/public-decorator.js';

@Controller('championships')
export class ChampionshipsController {
    constructor(private readonly championshipsService: ChampionshipsService) {}

    @Post()
    create(@Body() createChampionshipDto: CreateChampionshipDto) {
        return this.championshipsService.create(createChampionshipDto);
    }

    @Public()
    @Get()
    findAll() {
        return this.championshipsService.findAll();
    }

    @Public()
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.championshipsService.findOne(id);
    }

    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateChampionshipDto: UpdateChampionshipDto,
    ) {
        return this.championshipsService.update(id, updateChampionshipDto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.championshipsService.remove(id);
    }
}
