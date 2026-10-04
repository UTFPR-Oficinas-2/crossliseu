import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Robot } from './entities/robot.entity.js';

@Module({
    imports: [TypeOrmModule.forFeature([Robot])],
    controllers: [],
    providers: [],
    exports: [],
})
export class RobotsModule {}
