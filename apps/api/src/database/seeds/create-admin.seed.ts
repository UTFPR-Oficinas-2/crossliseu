import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../database.options.js';
import { User } from '../../modules/users/entities/user.entity.js';
import '../../config/env.js';

async function run() {
    const { ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
    if (!ADMIN_USERNAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
        throw new Error(
            'ADMIN_USERNAME, ADMIN_EMAIL and ADMIN_PASSWORD must be set',
        );
    }

    const dataSource = new DataSource(databaseOptions());
    await dataSource.initialize();

    try {
        const repo = dataSource.getRepository(User);
        const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
        const existing = await repo.findOneBy({ username: ADMIN_USERNAME });

        if (existing) {
            existing.email = ADMIN_EMAIL;
            existing.password = passwordHash;
            await repo.save(existing);
            console.log(`Updated admin user "${ADMIN_USERNAME}"`);
        } else {
            await repo.save(
                repo.create({
                    username: ADMIN_USERNAME,
                    email: ADMIN_EMAIL,
                    password: passwordHash,
                }),
            );
            console.log(`Created admin user "${ADMIN_USERNAME}"`);
        }
    } finally {
        await dataSource.destroy();
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
