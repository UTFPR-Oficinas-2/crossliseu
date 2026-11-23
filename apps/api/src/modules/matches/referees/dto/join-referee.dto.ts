import { IsNotEmpty, IsString, Length } from 'class-validator';
import { NormalizeText } from '../../../robots/dto/normalize.js';

export class JoinRefereeDto {
    @IsString()
    @IsNotEmpty()
    token: string;

    /** Trimmed and collapsed; compared case-insensitively */
    @NormalizeText()
    @IsString()
    @Length(1, 40)
    name: string;
}
