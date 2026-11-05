import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([User])],
    providers: [UsersService, UsersRepository],
    exports: [UsersService],
})
export class UsersModule {}
