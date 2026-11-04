import 'reflect-metadata';
import { UsersService } from './users.service.js';
import { User } from './entities/user.entity.js';
import type { UsersRepository } from './users.repository.js';

function setup(users: User[]) {
    const usersRepository = {
        findOneByUsername: vi.fn((username: string) =>
            Promise.resolve(users.find((u) => u.username === username) ?? null),
        ),
    };
    const service = new UsersService(
        usersRepository as unknown as UsersRepository,
    );
    const error = vi
        .spyOn(service.logger, 'error')
        .mockImplementation(() => {});
    return { service, error };
}

describe('UsersService.findByUsername', () => {
    it('returns the user', async () => {
        const user = new User();
        user.username = 'admin';
        const { service } = setup([user]);

        await expect(service.findByUsername('admin')).resolves.toBe(user);
    });

    it('returns null for an unknown username, without logging it', async () => {
        const { service, error } = setup([]);

        await expect(service.findByUsername('ghost')).resolves.toBeNull();
        expect(error).not.toHaveBeenCalled();
    });
});
