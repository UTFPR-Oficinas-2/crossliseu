import { Injectable, Logger } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Injectable()
export class UsersService {
    logger: Logger = new Logger(UsersService.name);

    // add repo
    constructor() {}

    create(createUserDto: CreateUserDto) {
        return 'This action adds a new user';
    }

    findAll() {
        return `This action returns all users`;
    }

    findOne(id: string) {
        return `This action returns a #${id} user`;
    }

    update(id: string, updateUserDto: UpdateUserDto) {
        return `This action updates a #${id} user`;
    }

    remove(id: string) {
        return `This action removes a #${id} user`;
    }
}
