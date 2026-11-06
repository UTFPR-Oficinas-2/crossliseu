import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { AuthService, DUMMY_HASH } from './auth.service.js';
import { User } from '../users/entities/user.entity.js';
import type { UsersService } from '../users/users.service.js';
import type { JwtService } from '@nestjs/jwt';

vi.mock('bcrypt', () => ({
    hashSync: vi.fn(() => 'dummy-hash'),
    compare: vi.fn((password: string, hash: string) =>
        Promise.resolve(password === 'right' && hash === 'admin-hash'),
    ),
}));

function admin(): User {
    const user = new User();
    user.id = 'u1';
    user.username = 'admin';
    user.email = 'admin@example.com';
    user.password = 'admin-hash';
    return user;
}

function setup(users: User[]) {
    const usersService = {
        findByUsername: vi.fn((username: string) =>
            Promise.resolve(users.find((u) => u.username === username) ?? null),
        ),
    };
    const service = new AuthService(
        usersService as unknown as UsersService,
        {} as JwtService,
    );
    const warn = vi.spyOn(service.logger, 'warn').mockImplementation(() => {});
    const error = vi
        .spyOn(service.logger, 'error')
        .mockImplementation(() => {});
    return { service, warn, error };
}

describe('AuthService.validateUser', () => {
    beforeEach(() => {
        vi.mocked(bcrypt.compare).mockClear();
    });

    it('still runs one bcrypt compare, against a dummy hash, for an unknown username', async () => {
        const { service } = setup([admin()]);

        await expect(
            service.validateUser('ghost', 'right'),
        ).resolves.toBeNull();

        expect(bcrypt.compare).toHaveBeenCalledTimes(1);
        expect(bcrypt.compare).toHaveBeenCalledWith('right', DUMMY_HASH);
    });

    it('returns null for a wrong password', async () => {
        const { service } = setup([admin()]);

        await expect(
            service.validateUser('admin', 'wrong'),
        ).resolves.toBeNull();
        expect(bcrypt.compare).toHaveBeenCalledTimes(1);
    });

    it('returns the user without the password hash for the right password', async () => {
        const { service } = setup([admin()]);

        const user = await service.validateUser('admin', 'right');

        expect(user).toEqual({
            id: 'u1',
            username: 'admin',
            email: 'admin@example.com',
        });
    });

    it('logs a failed login at warn, without the typed username', async () => {
        const { service, warn, error } = setup([admin()]);

        await service.validateUser('ghost', 'x');
        await service.validateUser('admin', 'x');

        expect(warn).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenCalledWith('login_failed');
        expect(JSON.stringify(warn.mock.calls)).not.toMatch(/ghost|admin/);
        expect(error).not.toHaveBeenCalled();
    });
});
