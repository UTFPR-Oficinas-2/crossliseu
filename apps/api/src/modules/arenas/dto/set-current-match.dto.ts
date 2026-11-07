import { IsUUID } from 'class-validator';

export class SetCurrentMatchDto {
    @IsUUID()
    matchId: string;
}
