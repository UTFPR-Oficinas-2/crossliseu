import {
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import {
    ArenasRepository,
    type LockedArenaResult,
    type SetCurrentMatchResult,
} from './arenas.repository.js';
import * as bcrypt from 'bcrypt';
import { generateDeviceToken, hashDeviceToken } from './device-token.js';
import { generateDeviceId } from './device-id.js';
import { arenaServerUrl } from './server-url.js';
import { ArenaNameDto } from './dto/arena-name.dto.js';
import { ArenaResponse } from './dto/arena-response.dto.js';
import type { DeviceCredentials } from './dto/device-credentials.dto.js';
import { SetCurrentMatchDto } from './dto/set-current-match.dto.js';
import { Arena } from './entities/arena.entity.js';
import { ArenaConnections } from './device/arena-connections.js';
import { CloseCode } from './device/arena-protocol.js';

const MAX_DEVICE_ID_ATTEMPTS = 5;

/** The arena a box logged in as on /arena */
export type AuthenticatedArena = { id: string; name: string };

@Injectable()
export class ArenasService {
    logger: Logger = new Logger(ArenasService.name);

    constructor(
        private readonly arenasRepository: ArenasRepository,
        private readonly connections: ArenaConnections,
    ) {}

    async findAll(userId: string): Promise<ArenaResponse[]> {
        const arenas = await this.arenasRepository.findByOwner(userId);
        return arenas.map((arena) => this.toResponse(arena));
    }

    /**
     * Creates an arena for the account. The device token is returned here and nowhere else:
     * only its hash is stored.
     */
    async create(
        dto: ArenaNameDto,
        userId: string,
    ): Promise<{ arena: ArenaResponse; credentials: DeviceCredentials }> {
        const token = generateDeviceToken();
        const tokenHash = await hashDeviceToken(token);

        for (let attempt = 1; attempt <= MAX_DEVICE_ID_ATTEMPTS; attempt++) {
            const arena = new Arena(
                dto.name,
                generateDeviceId(dto.name),
                tokenHash,
                userId,
            );
            const result = await this.arenasRepository.create(arena);
            if (result === 'done') {
                return {
                    arena: this.toResponse(arena),
                    credentials: {
                        deviceId: arena.deviceId,
                        token,
                        serverUrl: arenaServerUrl(),
                    },
                };
            }
            if (result === 'arena_name_taken') {
                this.logger.warn(result, { name: dto.name });
                throw new ConflictException(result);
            }
            // device_id_taken: the random suffix collided, draw another one
            this.logger.warn(result, { attempt });
        }
        throw new Error(
            `No free device id after ${MAX_DEVICE_ID_ATTEMPTS} attempts`,
        );
    }

    /** Renames the arena; its device id stays the same */
    async rename(
        id: string,
        dto: ArenaNameDto,
        userId: string,
    ): Promise<ArenaResponse> {
        const result = await this.arenasRepository.rename(id, userId, dto.name);
        if (result !== 'done') {
            this.logger.warn(result, { arenaId: id });
            throw result === 'arena_not_found'
                ? new NotFoundException(result)
                : new ConflictException(result);
        }

        const arena = await this.arenasRepository.findOwned(id, userId);
        if (!arena) {
            // Deleted right after the write
            this.logger.warn('arena_not_found', { arenaId: id });
            throw new NotFoundException('arena_not_found');
        }
        return this.toResponse(arena);
    }

    /** Issues a new device token, invalidating the old one; refused during a live match */
    async rotateToken(id: string, userId: string): Promise<DeviceCredentials> {
        const token = generateDeviceToken();
        const tokenHash = await hashDeviceToken(token);

        const result = await this.arenasRepository.rotateToken(
            id,
            userId,
            tokenHash,
        );
        if (result !== 'done') {
            this.logger.warn(result, { arenaId: id });
            throw lockedException(result);
        }
        // The box logged in with the old token: it reconnects and gets 4001 until reflashed
        this.revokeBox(id);

        const arena = await this.arenasRepository.findOwned(id, userId);
        if (!arena) {
            // Deleted right after the write
            this.logger.warn('arena_not_found', { arenaId: id });
            throw new NotFoundException('arena_not_found');
        }
        return {
            deviceId: arena.deviceId,
            token,
            serverUrl: arenaServerUrl(),
        };
    }

    /** Deletes the arena; refused during a live match */
    async remove(id: string, userId: string): Promise<void> {
        const result = await this.arenasRepository.remove(id, userId);
        if (result !== 'done') {
            this.logger.warn(result, { arenaId: id });
            throw lockedException(result);
        }
        this.revokeBox(id);
    }

    /**
     * Selects (or swaps to) the scheduled match the arena will run next. Selecting the
     * arena's current match again changes nothing.
     */
    async setCurrentMatch(
        arenaId: string,
        dto: SetCurrentMatchDto,
        userId: string,
    ): Promise<ArenaResponse> {
        const result = await this.arenasRepository.setCurrentMatch(
            arenaId,
            dto.matchId,
            userId,
        );
        if (result !== 'done') {
            this.logger.warn(result, { arenaId, matchId: dto.matchId });
            throw toException(result);
        }

        const arena = await this.arenasRepository.findOwned(arenaId, userId);
        if (!arena) {
            // Deleted right after the write
            this.logger.warn('arena_not_found', { arenaId });
            throw new NotFoundException('arena_not_found');
        }
        return this.toResponse(arena);
    }

    /**
     * Closes the arena's match or undoes a pick before Start, leaving the arena without a current
     * match; refused while the match is live. Without a current match it changes nothing.
     */
    async clearCurrentMatch(
        arenaId: string,
        userId: string,
    ): Promise<ArenaResponse> {
        const result = await this.arenasRepository.clearCurrentMatch(
            arenaId,
            userId,
        );
        if (result !== 'done') {
            this.logger.warn(result, { arenaId });
            throw lockedException(result);
        }

        const arena = await this.arenasRepository.findOwned(arenaId, userId);
        if (!arena) {
            // Deleted right after the write
            this.logger.warn('arena_not_found', { arenaId });
            throw new NotFoundException('arena_not_found');
        }
        return this.toResponse(arena);
    }

    /**
     * Checks a box's credentials from its `hello`. Null when the device id is unknown or deleted,
     * or the token doesn't match the stored hash. Never logs the token.
     */
    async authenticateDevice(
        deviceId: string,
        token: string,
    ): Promise<AuthenticatedArena | null> {
        const arena = await this.arenasRepository.findLiveByDeviceId(deviceId);
        if (!arena || !(await bcrypt.compare(token, arena.tokenHash))) {
            this.logger.warn('device_auth_failed', { deviceId });
            return null;
        }
        return { id: arena.id, name: arena.name };
    }

    /** Same as clearCurrentMatch, without an account check: for the arena device link (#19) */
    async releaseCurrentMatch(arenaId: string): Promise<void> {
        const result = await this.arenasRepository.clearCurrentMatch(
            arenaId,
            null,
        );
        if (result !== 'done') {
            this.logger.warn(result, { arenaId });
            throw lockedException(result);
        }
    }

    /** Closes the box connected with now-invalid credentials, as a fresh login would be refused */
    private revokeBox(arenaId: string): void {
        this.connections.drop(
            arenaId,
            CloseCode.BadCredentials,
            'bad_credentials',
        );
    }

    private toResponse(arena: Arena): ArenaResponse {
        const match = arena.currentMatch;
        return {
            id: arena.id,
            name: arena.name,
            deviceId: arena.deviceId,
            online: this.connections.isOnline(arena.id),
            currentMatchId: arena.currentMatchId,
            currentMatch:
                match?.robotA && match.robotB
                    ? {
                          id: match.id,
                          robotAName: match.robotA.name,
                          robotBName: match.robotB.name,
                      }
                    : null,
        };
    }
}

function toException(
    result: Exclude<SetCurrentMatchResult, 'done'>,
): NotFoundException | ConflictException {
    switch (result) {
        case 'arena_not_found':
        case 'match_not_found':
            return new NotFoundException(result);
        case 'match_not_scheduled':
        case 'match_already_current':
        case 'arena_match_started':
            return new ConflictException(result);
    }
}

function lockedException(
    result: Exclude<LockedArenaResult, 'done'>,
): NotFoundException | ConflictException {
    return result === 'arena_not_found'
        ? new NotFoundException(result)
        : new ConflictException(result);
}
