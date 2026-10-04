import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateChampionshipDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    scheduledDate?: Date;
}
