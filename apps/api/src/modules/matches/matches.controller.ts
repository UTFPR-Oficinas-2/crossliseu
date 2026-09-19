import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { MatchesService } from './matches.service.js';
import { CreateMatchDto } from './dto/create-match.dto.js';

@Controller()
export class MatchesController {
    constructor(private readonly matchesService: MatchesService) {}

    @Get()
    findAll() {
        return this.matchesService.findAll();
    }

    @Get()
    findById(@Param('id') id: string) {
        return this.matchesService.findById(id);
    }

    @Post()
    create(@Body() dto: CreateMatchDto) {
        return this.matchesService.create(dto.weightClass);
    }
}
