import { PartialType, PickType } from '@nestjs/swagger';
import { CreateMatchDto } from './create-match.dto.js';

// A match stays in its championship; only the robots change, and only while it is waiting
export class UpdateMatchDto extends PartialType(
    PickType(CreateMatchDto, ['robotAId', 'robotBId'] as const),
) {}
