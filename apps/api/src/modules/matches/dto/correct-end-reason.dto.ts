import { IsIn, ValidateIf } from 'class-validator';
import type { MatchEndReason } from '../entities/match.entity.js';

/**
 * PATCH /matches/:id/end-reason records what really ended a finished fight before close (#57).
 * `side` is the side that gave up; the service requires it for a surrender and refuses it otherwise.
 */
export class CorrectEndReasonDto {
    @IsIn(['time_out', 'manual', 'surrender'])
    endReason!: MatchEndReason;

    // Not @IsOptional(): it would also let `side: null` through, a surrender with no side
    @ValidateIf((o: CorrectEndReasonDto) => o.side !== undefined)
    @IsIn(['A', 'B'])
    side?: 'A' | 'B';
}
