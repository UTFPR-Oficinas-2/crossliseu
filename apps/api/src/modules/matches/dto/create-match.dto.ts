import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateMatchDto {
    @IsString()
    @IsNotEmpty()
    weightClass: string;

    @IsUUID()
    championshipId: string;

    @IsUUID()
    robotAId: string;

    @IsUUID()
    robotBId: string;
}
