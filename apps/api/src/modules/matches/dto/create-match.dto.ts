import { IsUUID } from 'class-validator';

// The weight class is not sent: MatchesService takes it from the two robots
export class CreateMatchDto {
    @IsUUID()
    championshipId: string;

    @IsUUID()
    robotAId: string;

    @IsUUID()
    robotBId: string;
}
