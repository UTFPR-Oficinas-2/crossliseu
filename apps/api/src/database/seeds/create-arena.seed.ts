import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../database.options.js';
import { Arena } from '../../modules/arenas/entities/arena.entity.js';
import {
    generateDeviceToken,
    hashDeviceToken,
} from '../../modules/arenas/device-token.js';
import '../../config/env.js';

async function run() {
    const { ARENA_NAME, ARENA_DEVICE_ID } = process.env;
    if (!ARENA_NAME || !ARENA_DEVICE_ID) {
        throw new Error('ARENA_NAME and ARENA_DEVICE_ID must be set');
    }

    const dataSource = new DataSource(databaseOptions());
    await dataSource.initialize();

    try {
        const repo = dataSource.getRepository(Arena);
        const token = generateDeviceToken();
        const tokenHash = await hashDeviceToken(token);
        // Soft-deleted arenas still hold the unique device_id, so re-seeding restores them
        const existing = await repo.findOne({
            where: { deviceId: ARENA_DEVICE_ID },
            withDeleted: true,
        });

        if (existing) {
            existing.name = ARENA_NAME;
            existing.tokenHash = tokenHash;
            existing.deletedAt = null;
            await repo.save(existing);
            console.log(`Rotated token for arena "${ARENA_NAME}"`);
        } else {
            await repo.save(new Arena(ARENA_NAME, ARENA_DEVICE_ID, tokenHash));
            console.log(`Created arena "${ARENA_NAME}"`);
        }

        // The only place the plain token ever appears: it is not stored or logged elsewhere
        console.log(`Device token (shown once): ${token}`);
    } finally {
        await dataSource.destroy();
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
