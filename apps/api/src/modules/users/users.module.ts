import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';
import { User } from './entities/user.entity.js';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [TypeOrmModule.forFeature([User])],
    controllers: [UsersController],
    providers: [UsersService, UsersRepository],
    exports: [UsersService],
})
export class UsersModule {}
