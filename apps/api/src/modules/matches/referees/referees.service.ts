import {
    BadRequestException,
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
import { FightEvents } from '../fight/fight-events.js';
import type { SideCounts } from '../fight/score.js';
import { nameKey } from './name-key.js';
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
        private readonly events: FightEvents,
    ) {}

    /** 404 match_not_found unless the match is live and `userId` owns its championship */
    private async assertOwned(matchId: string, userId: string): Promise<void> {
        const match = await this.repo.findMatch(matchId);
        if (
            !match ||
            !(await this.championships.isOwnedBy(match.championshipId, userId))
        ) {
            this.logger.warn('match_not_found', { id: matchId });
            throw new NotFoundException('match_not_found');
        }
    }

    /**
     * Owner-only. The match's shared referee token, created on the first call and the same on
     * every later one. 404 match_not_found, 409 match_closed once the fight is confirmed.
     */
    async issueToken(
        matchId: string,
        userId: string,
    ): Promise<{ token: string }> {
        await this.assertOwned(matchId, userId);
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
     * deleted or closed match, 409 referee_seats_full for a fourth name, 400 referee_name_invalid
     * for a name made only of accent marks.
     */
    async join(token: string, name: string): Promise<RefereeSession> {
        // Only accent marks: nothing to tell referees apart by
        if (nameKey(name) === '') {
            throw new BadRequestException('referee_name_invalid');
        }
        const outcome = await this.repo.join(token, normalizeText(name));
        if (outcome.kind === 'invalid_token') {
            throw new UnauthorizedException('referee_invalid_token');
        }
        if (outcome.kind === 'seats_full') {
            throw new ConflictException('referee_seats_full');
        }
        const { kind: _kind, created, ...session } = outcome;
        if (created) {
            // The operator's seat list follows the pushed state
            this.events.emit({ matchId: session.matchId, arenaId: null });
        }
        return session;
    }

    /** Server-internal, no owner check: the names holding a seat on the match */
    async seatedNames(matchId: string): Promise<string[]> {
        const seats = await this.repo.listSeats(matchId);
        return seats.map((s) => s.name);
    }

    /** Owner-only. Who holds each seat. 404 match_not_found. */
    async listSeats(
        matchId: string,
        userId: string,
    ): Promise<{ seat: JudgeSeat; name: string }[]> {
        await this.assertOwned(matchId, userId);
        return this.repo.listSeats(matchId);
    }

    /**
     * Owner-only. Frees `seat` before Start, for a misspelled duplicate or a stranger with the
     * link. 404 match_not_found, 409 match_started once the fight has started.
     */
    async freeSeat(
        matchId: string,
        seat: JudgeSeat,
        userId: string,
    ): Promise<void> {
        await this.assertOwned(matchId, userId);
        const result = await this.repo.freeSeat(matchId, seat);
        if (result === 'missing') {
            throw new NotFoundException('match_not_found');
        }
        if (result === 'started') {
            throw new ConflictException('match_started');
        }
        this.events.emit({ matchId, arenaId: null });
    }

    /** The seat this credential holds on a live, not yet closed match; null otherwise */
    resolve(
        token: string,
        name: string,
    ): Promise<{ matchId: string; seat: JudgeSeat } | null> {
        return this.repo.findSeat(token, normalizeText(name));
    }
}
