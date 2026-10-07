import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateRobotDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    weightClass: string;

    @IsString()
    @IsNotEmpty()
    team: string;

    @IsUUID()
    championshipId: string;
}
