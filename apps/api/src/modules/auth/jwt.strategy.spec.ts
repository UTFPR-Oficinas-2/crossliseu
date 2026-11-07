import 'reflect-metadata';

// constants.ts reads SECRET when it is imported
vi.hoisted(() => {
    process.env.SECRET ??= 'unit-test-secret';
});

import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy.js';
import { User } from '../users/entities/user.entity.js';
import type { UsersService } from '../users/users.service.js';

function setup(users: User[]) {
    const usersService = {
        findById: vi.fn((id: string) =>
            Promise.resolve(users.find((u) => u.id === id) ?? null),
        ),
    };
    return new JwtStrategy(usersService as unknown as UsersService);
}

describe('JwtStrategy.validate', () => {
    it('returns the user for a token whose user exists', async () => {
        const user = new User();
        user.id = 'u1';
        user.username = 'admin';
        const strategy = setup([user]);

        await expect(
            strategy.validate({ sub: 'u1', username: 'admin' }),
        ).resolves.toEqual({ userId: 'u1', username: 'admin' });
    });

    it('rejects a token whose user no longer exists', async () => {
        const strategy = setup([]);

        await expect(
            strategy.validate({ sub: 'gone', username: 'admin' }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });
});
