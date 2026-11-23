import { IsIn, IsNotEmpty, IsString, Length } from 'class-validator';
import { NormalizeText } from '../../../robots/dto/normalize.js';
import type { ScoreAction } from '../../entities/match-event.entity.js';
import type { Side } from '../../fight/score.js';

/** One button press on a referee's phone, with the referee's credential */
export class SubmitScoreDto {
    @IsString()
    @IsNotEmpty()
    token: string;

    @NormalizeText()
    @IsString()
    @Length(1, 40)
    name: string;

    @IsIn(['A', 'B'])
    side: Side;

    /** +1 scores; −1 only undoes this referee's own point for the side */
    @IsIn([1, -1])
    action: ScoreAction;
}
