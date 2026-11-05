import { PartialType, PickType } from '@nestjs/swagger';
import { CreateMatchDto } from './create-match.dto.js';

// A match stays in its championship; only the robots and the time change, and only while it is scheduled
export class UpdateMatchDto extends PartialType(
    PickType(CreateMatchDto, ['robotAId', 'robotBId', 'scheduledAt'] as const),
) {}
