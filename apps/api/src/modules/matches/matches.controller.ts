import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
} from '@nestjs/common';
import { MatchesService } from './matches.service.js';
import { CreateMatchDto } from './dto/create-match.dto.js';

@Controller('matches')
export class MatchesController {
    constructor(private readonly matchesService: MatchesService) {}

    @Post()
    create(@Body() createMatchDto: CreateMatchDto) {
        return this.matchesService.create(createMatchDto);
    }

    @Get()
    findAll() {
        return this.matchesService.findAll();
    }

    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.matchesService.findOne(id);
    }

    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateMatchDto: any,
    ) {}

    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string) {}
}
