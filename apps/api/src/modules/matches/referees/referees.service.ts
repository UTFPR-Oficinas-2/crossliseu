import {
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ChampionshipsService } from '../../championships/championships.service.js';
import { normalizeText } from '../../robots/dto/normalize.js';
import type { JudgeSeat } from '../entities/match-event.entity.js';
import type { SideCounts } from '../fight/score.js';
import { RefereesRepository } from './referees.repository.js';

export interface RefereeSession {
    matchId: string;
    seat: JudgeSeat;
    /** As stored at the first join */
    name: string;
    /** This referee's own points per side */
    counts: SideCounts;
}

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

    /**
     * Public. Seats `name` with the shared token: 401 referee_invalid_token for an unknown,
     * deleted or closed match, 409 referee_seats_full for a fourth name.
     */
    async join(token: string, name: string): Promise<RefereeSession> {
        const outcome = await this.repo.join(token, normalizeText(name));
        if (outcome.kind === 'invalid_token') {
            throw new UnauthorizedException('referee_invalid_token');
        }
        if (outcome.kind === 'seats_full') {
            throw new ConflictException('referee_seats_full');
        }
        const { kind: _kind, ...session } = outcome;
        return session;
    }

    /** The seat this credential holds on a live, not yet closed match; null otherwise */
    resolve(
        token: string,
        name: string,
    ): Promise<{ matchId: string; seat: JudgeSeat } | null> {
        return this.repo.findSeat(token, normalizeText(name));
    }
}
