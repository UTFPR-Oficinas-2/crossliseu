import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ChampionshipsService } from '../../championships/championships.service.js';
import type { RefereesRepository } from './referees.repository.js';
import { FightEvents } from '../fight/fight-events.js';
import { RefereesService } from './referees.service.js';

const MATCH_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const USER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function setup({
    owner = true,
    closed = false,
    missing = false,
    token = null as string | null,
    created = true,
    freeResult = 'done' as 'done' | 'started' | 'missing',
} = {}) {
    const store = { token };
    const repo = {
        findMatch: vi.fn(() =>
            Promise.resolve(
                missing ? null : { id: MATCH_ID, championshipId: 'c' },
            ),
        ),
        isClosed: vi.fn(() => Promise.resolve(closed)),
        findToken: vi.fn(() => Promise.resolve(store.token)),
        join: vi.fn(() =>
            Promise.resolve({
                kind: 'seated' as const,
                created,
                matchId: MATCH_ID,
                seat: 1 as const,
                name: 'Ana',
                counts: { A: 0, B: 0 },
            }),
        ),
        freeSeat: vi.fn(() => Promise.resolve(freeResult)),
        listSeats: vi.fn(() =>
            Promise.resolve([
                { seat: 1 as const, name: 'Ana' },
                { seat: 3 as const, name: 'Bia' },
            ]),
        ),
        claimToken: vi.fn((_id: string, next: string) => {
            store.token ??= next;
            return Promise.resolve();
        }),
    };
    const championships = {
        isOwnedBy: vi.fn(() => Promise.resolve(owner)),
    };
    const events = new FightEvents();
    const changes: unknown[] = [];
    events.onChange((change) => changes.push(change));
    const service = new RefereesService(
        repo as unknown as RefereesRepository,
        championships as unknown as ChampionshipsService,
        events,
    );
    return { service, repo, store, changes };
}

describe('RefereesService.issueToken', () => {
    it('creates a base64url token of 16 random bytes', async () => {
        const { service, store } = setup();

        const { token } = await service.issueToken(MATCH_ID, USER_ID);

        expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
        expect(store.token).toBe(token);
    });

    it('returns the stored token without creating another', async () => {
        const { service, repo } = setup({ token: 'existing' });

        expect(await service.issueToken(MATCH_ID, USER_ID)).toEqual({
            token: 'existing',
        });
        expect(repo.claimToken).not.toHaveBeenCalled();
    });

    it('returns the token a concurrent request stored first', async () => {
        const { service, repo, store } = setup();
        repo.claimToken.mockImplementation(() => {
            store.token = 'winner';
            return Promise.resolve();
        });

        expect(await service.issueToken(MATCH_ID, USER_ID)).toEqual({
            token: 'winner',
        });
    });

    it.each([
        ['not owned', { owner: false }],
        ['unknown', { missing: true }],
    ])('is 404 match_not_found when the match is %s', async (_, options) => {
        const { service, repo } = setup(options);

        await expect(service.issueToken(MATCH_ID, USER_ID)).rejects.toThrow(
            new NotFoundException('match_not_found'),
        );
        expect(repo.claimToken).not.toHaveBeenCalled();
    });

    it('is 409 match_closed once the fight is closed', async () => {
        const { service, repo } = setup({ closed: true, token: 'old' });

        await expect(service.issueToken(MATCH_ID, USER_ID)).rejects.toThrow(
            new ConflictException('match_closed'),
        );
        expect(repo.claimToken).not.toHaveBeenCalled();
    });
});

describe('RefereesService change events', () => {
    it('a new seat emits a fight change', async () => {
        const { service, changes } = setup();

        await service.join('t', 'Ana');

        expect(changes).toEqual([{ matchId: MATCH_ID, arenaId: null }]);
    });

    it('a rejoin emits nothing', async () => {
        const { service, changes } = setup({ created: false });

        const session = await service.join('t', 'Ana');

        expect(changes).toEqual([]);
        expect(session).not.toHaveProperty('created');
    });

    it('a free emits a fight change', async () => {
        const { service, changes } = setup();

        await service.freeSeat(MATCH_ID, 1, USER_ID);

        expect(changes).toEqual([{ matchId: MATCH_ID, arenaId: null }]);
    });

    it('a refused free emits nothing', async () => {
        const { service, changes } = setup({ freeResult: 'started' });

        await expect(service.freeSeat(MATCH_ID, 1, USER_ID)).rejects.toThrow(
            new ConflictException('match_started'),
        );
        expect(changes).toEqual([]);
    });
});

describe('RefereesService.seatedNames', () => {
    it('returns the seated names without an owner check', async () => {
        const { service, repo } = setup({ owner: false });

        await expect(service.seatedNames(MATCH_ID)).resolves.toEqual([
            'Ana',
            'Bia',
        ]);
        expect(repo.listSeats).toHaveBeenCalledWith(MATCH_ID);
        expect(repo.findMatch).not.toHaveBeenCalled();
    });
});
