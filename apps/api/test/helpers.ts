import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Arena } from '../src/modules/arenas/entities/arena.entity.js';
import { generateDeviceToken } from '../src/modules/arenas/device-token.js';
import { generateDeviceId } from '../src/modules/arenas/device-id.js';
import { Championship } from '../src/modules/championships/entities/championship.entity.js';
import { Match } from '../src/modules/matches/entities/match.entity.js';
import { Robot } from '../src/modules/robots/entities/robot.entity.js';
import { User } from '../src/modules/users/entities/user.entity.js';
import type { WeightClass } from '../src/modules/robots/weight-class.js';

/** The real AppModule on the test database, configured like main.ts */
export async function createTestApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    return app;
}

export function dataSourceOf(app: INestApplication): DataSource {
    return app.get(DataSource);
}

export async function resetDatabase(ds: DataSource): Promise<void> {
    await ds.query(
        'TRUNCATE "users", "arenas", "matches", "robots", "championships" CASCADE',
    );
}

export async function createUser(
    ds: DataSource,
    username: string,
    password: string,
): Promise<User> {
    const repo = ds.getRepository(User);
    return repo.save(
        repo.create({
            username,
            email: `${username}@example.com`,
            password: await bcrypt.hash(password, 4),
        }),
    );
}

export async function loginToken(
    app: INestApplication,
    username: string,
    password: string,
): Promise<string> {
    const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username, password })
        .expect(201);
    return (response.body as { token: string }).token;
}

/**
 * The id of a user to record as creator of seeded rows (created_by_user_id is NOT NULL): the
 * oldest live user, or a new `seeder` when there is none.
 */
export async function seedCreatorId(ds: DataSource): Promise<string> {
    const [existing] = await ds
        .getRepository(User)
        .find({ order: { createdAt: 'ASC' }, take: 1 });
    return (existing ?? (await createUser(ds, 'seeder', 'pw'))).id;
}

export async function seedChampionship(
    ds: DataSource,
    name = 'Copa',
): Promise<Championship> {
    const day = new Date('2026-11-04T12:00:00Z');
    return ds
        .getRepository(Championship)
        .save(new Championship(name, day, day, await seedCreatorId(ds)));
}

export async function seedRobot(
    ds: DataSource,
    championshipId: string,
    {
        name = 'Titã',
        weightClass = 'lightweight',
    }: { name?: string; weightClass?: WeightClass } = {},
): Promise<Robot> {
    return ds
        .getRepository(Robot)
        .save(
            new Robot(
                name,
                weightClass,
                'Equipe',
                championshipId,
                await seedCreatorId(ds),
            ),
        );
}

export async function seedMatch(
    ds: DataSource,
    championshipId: string,
    robotAId: string,
    robotBId: string,
): Promise<Match> {
    return ds
        .getRepository(Match)
        .save(
            new Match(
                'lightweight',
                championshipId,
                robotAId,
                robotBId,
                await seedCreatorId(ds),
                new Date('2026-11-04T13:00:00Z'),
            ),
        );
}

/** An arena with a dummy token hash (the device token isn't used by these tests), owned by the oldest user unless given */
export async function seedArena(
    ds: DataSource,
    name: string,
    ownerUserId?: string,
): Promise<Arena> {
    return ds
        .getRepository(Arena)
        .save(
            new Arena(
                name,
                `${name}-device`,
                'not-a-real-hash',
                ownerUserId ?? (await seedCreatorId(ds)),
            ),
        );
}

/** An arena with a real device token (bcrypt cost 4), owned by the oldest user */
export async function seedDeviceArena(
    ds: DataSource,
    name: string,
): Promise<{ arena: Arena; token: string }> {
    const token = generateDeviceToken();
    const arena = await ds
        .getRepository(Arena)
        .save(
            new Arena(
                name,
                generateDeviceId(name),
                await bcrypt.hash(token, 4),
                await seedCreatorId(ds),
            ),
        );
    return { arena, token };
}

/** A promise the test resolves by hand, to hold a transaction open */
export function deferred<T = void>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

/** Whether the promise is still pending after `ms` */
export async function isPendingAfter(
    promise: Promise<unknown>,
    ms: number,
): Promise<boolean> {
    const marker = Symbol('pending');
    const winner = await Promise.race([
        promise.then(
            () => undefined,
            () => undefined,
        ),
        new Promise((r) => setTimeout(() => r(marker), ms)),
    ]);
    return winner === marker;
}
