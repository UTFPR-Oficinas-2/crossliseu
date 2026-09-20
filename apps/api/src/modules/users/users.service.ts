import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { User } from './entities/user.entity.js';
import { UsersRepository } from './users.repository.js';

@Injectable()
export class UsersService {
    logger: Logger = new Logger(UsersService.name);

    // add repo
    constructor(private readonly usersRepository: UsersRepository) {}

    create(createUserDto: CreateUserDto) {
        // TODO
        return 'This action adds a new user';
    }

    findAll() {
        // TODO
        return `This action returns all users`;
    }

    findOneById(id: string) {
        // TODO
        return `This action returns a #${id} user`;
    }

    async findByUsername(username: string): Promise<User> {
        const user = await this.usersRepository.findOneByUsername(username);

        if (!user) {
            this.logger.error('UserNotFound', { username });
            throw new NotFoundException('UserNotFound');
        }

        return user;
    }

    update(id: string, updateUserDto: UpdateUserDto) {
        // TODO
        return `This action updates a #${id} user`;
    }

    delete(id: string) {
        // TODO
        return `This action removes a #${id} user`;
    }
}
