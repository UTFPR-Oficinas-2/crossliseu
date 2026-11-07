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
    Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RobotsService } from './robots.service.js';
import { CreateRobotDto } from './dto/create-robot.dto.js';
import { UpdateRobotDto } from './dto/update-robot.dto.js';
import { Public } from '../auth/public-decorator.js';
import { CurrentUserId } from '../auth/current-user-id.decorator.js';

@ApiTags('robots')
@ApiBearerAuth()
@Controller('robots')
export class RobotsController {
    constructor(private readonly robotsService: RobotsService) {}

    @Post()
    create(
        @Body() createRobotDto: CreateRobotDto,
        @CurrentUserId() userId: string,
    ) {
        return this.robotsService.create(createRobotDto, userId);
    }

    @Public()
    @Get()
    @ApiQuery({ name: 'championshipId', required: false })
    findAll(
        @Query('championshipId', new ParseUUIDPipe({ optional: true }))
        championshipId?: string,
    ) {
        return this.robotsService.findAll(championshipId);
    }

    @Public()
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.robotsService.findOne(id);
    }

    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateRobotDto: UpdateRobotDto,
        @CurrentUserId() userId: string,
    ) {
        return this.robotsService.update(id, updateRobotDto, userId);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUserId() userId: string,
    ) {
        return this.robotsService.remove(id, userId);
    }
}
