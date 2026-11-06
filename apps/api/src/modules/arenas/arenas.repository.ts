import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
    EntityManager,
    IsNull,
    Not,
    QueryFailedError,
    Repository,
} from 'typeorm';
import { Arena } from './entities/arena.entity.js';
import { Championship } from '../championships/entities/championship.entity.js';
import { Match } from '../matches/entities/match.entity.js';

/** Outcome of pointing an arena at a match; anything but 'done' left the arena unchanged */
export type SetCurrentMatchResult =
    | 'done'
    | 'arena_not_found'
    | 'match_not_found'
    | 'match_not_scheduled'
    | 'match_already_current'
    | 'arena_match_started';

const CURRENT_MATCH_RELATIONS = {
    currentMatch: { robotA: true, robotB: true },
};

const UNIQUE_VIOLATION = '23505';
const CURRENT_MATCH_UNIQUE = 'UQ_arenas_current_match_id';

/**
 * Lock order shared by every write that spans arenas and matches, so two of them can't
 * deadlock: the arena, then the match(es).
 */
@Injectable()
export class ArenasRepository {
    constructor(
        @InjectRepository(Arena)
        private readonly repository: Repository<Arena>,
    ) {}

    /** The account's live arenas, in creation order so the operator's list stays stable */
    findByOwner(ownerUserId: string): Promise<Arena[]> {
        return this.repository.find({
            where: { ownerUserId },
            relations: CURRENT_MATCH_RELATIONS,
            order: { createdAt: 'ASC' },
        });
    }

    /** Null for an unknown, deleted or someone else's arena */
    findOwned(id: string, ownerUserId: string): Promise<Arena | null> {
        return this.repository.findOne({
            where: { id, ownerUserId },
            relations: CURRENT_MATCH_RELATIONS,
        });
    }

    /**
     * Points the arena at the match, in one transaction holding the arena's row lock and then
     * the match's, so two operators selecting the same match (or swapping the same arena)
     * are serialized and the checks below can't go stale before the write.
     */
    async setCurrentMatch(
        arenaId: string,
        matchId: string,
        ownerUserId: string,
    ): Promise<SetCurrentMatchResult> {
        try {
            return await this.repository.manager.transaction((manager) =>
                this.setCurrentMatchLocked(
                    manager,
                    arenaId,
                    matchId,
                    ownerUserId,
                ),
            );
        } catch (error) {
            // Backstop: the locks should make this unreachable, the constraint makes it safe
            if (isCurrentMatchUniqueViolation(error)) {
                return 'match_already_current';
            }
            throw error;
        }
    }

    /** False when the arena does not exist */
    async clearCurrentMatch(arenaId: string): Promise<boolean> {
        const result = await this.repository.update(
            { id: arenaId, deletedAt: IsNull() },
            { currentMatchId: null },
        );
        return result.affected === 1;
    }

    private async setCurrentMatchLocked(
        manager: EntityManager,
        arenaId: string,
        matchId: string,
        ownerUserId: string,
    ): Promise<SetCurrentMatchResult> {
        const arena = await manager.findOne(Arena, {
            where: { id: arenaId, ownerUserId },
            lock: { mode: 'pessimistic_write' },
        });
        if (!arena) {
            return 'arena_not_found';
        }

        // find() skips soft-deleted matches
        const match = await this.lockMatch(manager, matchId);
        if (!match) {
            return 'match_not_found';
        }
        // Another organization's match looks like an unknown one, whatever its state
        const ownsMatch = await manager.exists(Championship, {
            where: { id: match.championshipId, createdByUserId: ownerUserId },
        });
        if (!ownsMatch) {
            return 'match_not_found';
        }
        if (match.state !== 'scheduled') {
            return 'match_not_scheduled';
        }
        if (arena.currentMatchId === matchId) {
            return 'done';
        }

        const elsewhere = await manager.exists(Arena, {
            where: { currentMatchId: matchId, id: Not(arenaId) },
        });
        if (elsewhere) {
            return 'match_already_current';
        }

        // Locked so the current match can't start while it is swapped out
        if (arena.currentMatchId) {
            const current = await this.lockMatch(manager, arena.currentMatchId);
            if (current && current.state !== 'scheduled') {
                return 'arena_match_started';
            }
        }

        await manager.update(
            Arena,
            { id: arenaId },
            { currentMatchId: matchId },
        );
        return 'done';
    }

    private lockMatch(
        manager: EntityManager,
        id: string,
    ): Promise<Match | null> {
        return manager.findOne(Match, {
            where: { id },
            lock: { mode: 'pessimistic_write' },
        });
    }
}

function isCurrentMatchUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
        return false;
    }
    const driverError = error.driverError as {
        code?: string;
        constraint?: string;
    };
    return (
        driverError.code === UNIQUE_VIOLATION &&
        driverError.constraint === CURRENT_MATCH_UNIQUE
    );
}
