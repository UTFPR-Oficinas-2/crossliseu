import { IsIn, IsOptional } from 'class-validator';
import type { MatchEndReason } from '../entities/match.entity.js';

/**
 * PATCH /matches/:id/end-reason records what really ended a finished fight before close (#57).
 * `side` is the side that gave up; the service requires it for a surrender and refuses it otherwise.
 */
export class CorrectEndReasonDto {
    @IsIn(['time_out', 'manual', 'surrender'])
    endReason!: MatchEndReason;

    @IsOptional()
    @IsIn(['A', 'B'])
    side?: 'A' | 'B';
}
