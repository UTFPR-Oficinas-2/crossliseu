import 'reflect-metadata';
import { MatchesController } from './matches.controller.js';
import type { FightService } from './fight/fight.service.js';
import type { MatchesService } from './matches.service.js';

const id = 'match-id';
const userId = 'owner-id';
const fight = {
    matchId: id,
    status: 'finished',
    remainingMs: 10_000,
    endReason: 'manual',
    robots: { A: { name: 'Tritura' }, B: { name: 'Ferrugem' } },
};
const operatorFight = {
    ...fight,
    closed: false,
    hasSelectedArena: true,
    winnerSide: null,
};

function setup() {
    const service = {
        state: vi.fn().mockResolvedValue(fight),
        operatorState: vi.fn().mockResolvedValue(operatorFight),
        command: vi.fn().mockResolvedValue(fight),
        operatorCommand: vi.fn().mockResolvedValue(operatorFight),
    };
    const controller = new MatchesController(
        {} as MatchesService,
        service as unknown as FightService,
    );
    return { controller, service };
}

describe('MatchesController fight views', () => {
    it('routes public reads according to the view query', async () => {
        const { controller, service } = setup();

        expect(await controller.state(id)).toEqual(fight);
        expect(await controller.state(id, 'operator')).toEqual(operatorFight);
        expect(service.state).toHaveBeenCalledExactlyOnceWith(id);
        expect(service.operatorState).toHaveBeenCalledExactlyOnceWith(id);
    });

    it.each(['start', 'pause', 'resume', 'finish', 'close'] as const)(
        'routes %s with the authenticated user and the requested view',
        async (command) => {
            const { controller, service } = setup();

            expect(await controller[command](id, userId)).toEqual(fight);
            expect(await controller[command](id, userId, 'operator')).toEqual(
                operatorFight,
            );
            expect(service.command).toHaveBeenCalledExactlyOnceWith(
                id,
                command,
                userId,
            );
            expect(service.operatorCommand).toHaveBeenCalledExactlyOnceWith(
                id,
                command,
                userId,
            );
        },
    );
});
