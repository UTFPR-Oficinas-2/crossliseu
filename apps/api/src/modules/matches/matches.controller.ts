import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';
import { CreateMatchDto } from './dto/create-match.dto.js';
import { MatchesService } from './matches.service.js';
import { Public } from '../auth/public-decorator.js';

@Controller('matches')
export class MatchesController {
    constructor(private readonly matchesService: MatchesService) {}

    @Post()
    create(@Body() createMatchDto: CreateMatchDto) {
        return this.matchesService.create(createMatchDto);
    }

    @Public()
    @Get()
    findAll() {
        return this.matchesService.findAll();
    }

    @Public()
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
