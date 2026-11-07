import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { NormalizeText } from '../../robots/dto/normalize.js';

export const ARENA_NAME_MAX_LENGTH = 40;

// Body of both POST /arenas and PATCH /arenas/:id
export class ArenaNameDto {
    @NormalizeText()
    @IsString()
    @IsNotEmpty()
    @MaxLength(ARENA_NAME_MAX_LENGTH)
    name: string;
}
