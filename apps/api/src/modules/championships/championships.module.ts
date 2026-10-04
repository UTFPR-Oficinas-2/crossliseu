import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Championship } from './entities/championship.entity.js';

@Module({
    imports: [TypeOrmModule.forFeature([Championship])],
    controllers: [],
    providers: [],
    exports: [],
})
export class MatchesModule {}
