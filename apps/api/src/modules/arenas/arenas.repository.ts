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

/** Outcome of creating an arena; anything but 'done' saved nothing */
export type CreateArenaResult = 'done' | 'arena_name_taken' | 'device_id_taken';

/** Outcome of a write that needs the arena's current match not to be live */
export type LockedArenaResult = 'done' | 'arena_not_found' | 'arena_match_live';

export type RenameArenaResult = 'done' | 'arena_not_found' | 'arena_name_taken';

const UNIQUE_VIOLATION = '23505';
const CURRENT_MATCH_UNIQUE = 'UQ_arenas_current_match_id';
const OWNER_NAME_UNIQUE = 'UQ_arenas_owner_user_id_lower_name';
const DEVICE_ID_UNIQUE = 'UQ_arenas_device_id';

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

    /** Saves the arena (id and timestamps are filled in on success) */
    async create(arena: Arena): Promise<CreateArenaResult> {
        try {
            await this.repository.save(arena);
            return 'done';
        } catch (error) {
            switch (uniqueViolationOf(error)) {
                case OWNER_NAME_UNIQUE:
                    return 'arena_name_taken';
                case DEVICE_ID_UNIQUE:
                    return 'device_id_taken';
                default:
                    throw error;
            }
        }
    }

    /** Renames a live arena of the account; the device id never changes */
    async rename(
        id: string,
        ownerUserId: string,
        name: string,
    ): Promise<RenameArenaResult> {
        try {
            const result = await this.repository.update(
                { id, ownerUserId, deletedAt: IsNull() },
                { name },
            );
            return result.affected === 1 ? 'done' : 'arena_not_found';
        } catch (error) {
            if (uniqueViolationOf(error) === OWNER_NAME_UNIQUE) {
                return 'arena_name_taken';
            }
            throw error;
        }
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
            if (uniqueViolationOf(error) === CURRENT_MATCH_UNIQUE) {
                return 'match_already_current';
            }
            throw error;
        }
    }

    /** Replaces the device token hash, unless the arena's current match is live */
    rotateToken(
        id: string,
        ownerUserId: string,
        tokenHash: string,
    ): Promise<LockedArenaResult> {
        return this.repository.manager.transaction(async (manager) => {
            const arena = await this.withLiveCheck(manager, id, ownerUserId);
            if (!(arena instanceof Arena)) {
                return arena;
            }
            await manager.update(Arena, { id }, { tokenHash });
            return 'done';
        });
    }

    /**
     * Soft-deletes the arena and frees its current match, unless that match is live. The
     * matches keep their arena_id as history.
     */
    remove(id: string, ownerUserId: string): Promise<LockedArenaResult> {
        return this.repository.manager.transaction(async (manager) => {
            const arena = await this.withLiveCheck(manager, id, ownerUserId);
            if (!(arena instanceof Arena)) {
                return arena;
            }
            await manager.update(Arena, { id }, { currentMatchId: null });
            await manager.softDelete(Arena, { id });
            return 'done';
        });
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

    /**
     * Locks the owner's arena, then its current match (same order as setCurrentMatch), so the
     * match can't go live while the caller writes. Returns the arena, or the refusal.
     */
    private async withLiveCheck(
        manager: EntityManager,
        id: string,
        ownerUserId: string,
    ): Promise<Arena | Exclude<LockedArenaResult, 'done'>> {
        const arena = await manager.findOne(Arena, {
            where: { id, ownerUserId },
            lock: { mode: 'pessimistic_write' },
        });
        if (!arena) {
            return 'arena_not_found';
        }
        if (arena.currentMatchId) {
            const match = await this.lockMatch(manager, arena.currentMatchId);
            if (match?.state === 'ongoing' || match?.state === 'paused') {
                return 'arena_match_live';
            }
        }
        return arena;
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

/** The violated constraint (or unique index) name, or undefined if it is not a unique violation */
function uniqueViolationOf(error: unknown): string | undefined {
    if (!(error instanceof QueryFailedError)) {
        return undefined;
    }
    const driverError = error.driverError as {
        code?: string;
        constraint?: string;
    };
    return driverError.code === UNIQUE_VIOLATION
        ? driverError.constraint
        : undefined;
}
