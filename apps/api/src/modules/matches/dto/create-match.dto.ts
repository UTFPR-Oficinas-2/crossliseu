import { IsUUID } from 'class-validator';

// The weight class is not sent: MatchesService takes it from the two robots.
// The creator is not sent either: the controller takes it from the JWT.
// There is no date: a match is ordered by created_at and starts when the operator starts it.
export class CreateMatchDto {
    @IsUUID()
    championshipId: string;

    @IsUUID()
    robotAId: string;

    @IsUUID()
    robotBId: string;
}
