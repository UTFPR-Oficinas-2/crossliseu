import { Type } from 'class-transformer';
import { IsDate, IsUUID } from 'class-validator';

// The weight class is not sent: MatchesService takes it from the two robots.
// The creator is not sent either: the controller takes it from the JWT.
export class CreateMatchDto {
    @IsUUID()
    championshipId: string;

    @IsUUID()
    robotAId: string;

    @IsUUID()
    robotBId: string;

    @Type(() => Date)
    @IsDate()
    scheduledAt: Date;
}
