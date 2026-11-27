import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public-decorator.js';
import { ResultsService } from './results.service.js';

/** Public history (#22): confirmed fights only, no login */
@ApiTags('results')
@Controller()
export class ResultsController {
    constructor(private readonly results: ResultsService) {}

    /** The championship's confirmed fights, most recently closed first */
    @Public()
    @Get('championships/:id/results')
    championshipResults(@Param('id', ParseUUIDPipe) id: string) {
        return this.results.championshipResults(id);
    }

    /** One confirmed fight: result, score totals, duration, processing status and heatmap */
    @Public()
    @Get('matches/:id/result')
    fightResult(@Param('id', ParseUUIDPipe) id: string) {
        return this.results.fightResult(id);
    }
}
