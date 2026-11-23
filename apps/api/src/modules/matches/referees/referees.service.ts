import {
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ChampionshipsService } from '../../championships/championships.service.js';
import { RefereesRepository } from './referees.repository.js';

/** 16 random bytes, base64url: 22 characters that fit in the /referee/:accessToken link */
function newToken(): string {
    return randomBytes(16).toString('base64url');
}

@Injectable()
export class RefereesService {
    logger: Logger = new Logger(RefereesService.name);

    constructor(
        private readonly repo: RefereesRepository,
        private readonly championships: ChampionshipsService,
    ) {}

    /**
     * Owner-only. The match's shared referee token, created on the first call and the same on
     * every later one. 404 match_not_found, 409 match_closed once the fight is confirmed.
     */
    async issueToken(
        matchId: string,
        userId: string,
    ): Promise<{ token: string }> {
        const match = await this.repo.findMatch(matchId);
        if (
            !match ||
            !(await this.championships.isOwnedBy(match.championshipId, userId))
        ) {
            this.logger.warn('match_not_found', { id: matchId });
            throw new NotFoundException('match_not_found');
        }
        if (await this.repo.isClosed(matchId)) {
            throw new ConflictException('match_closed');
        }
        const existing = await this.repo.findToken(matchId);
        if (existing) {
            return { token: existing };
        }
        await this.repo.claimToken(matchId, newToken());
        // Re-read: a concurrent call may have stored its token first
        const token = await this.repo.findToken(matchId);
        if (!token) {
            throw new NotFoundException('match_not_found');
        }
        return { token };
    }
}
