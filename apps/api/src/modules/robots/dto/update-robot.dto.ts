import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateRobotDto } from './create-robot.dto.js';

// A robot stays in the championship it was registered in
export class UpdateRobotDto extends PartialType(
    OmitType(CreateRobotDto, ['championshipId'] as const),
) {}
