import { IsIn, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { NormalizeText } from './normalize.js';
import { WEIGHT_CLASSES, type WeightClass } from '../weight-class.js';

export class CreateRobotDto {
    @NormalizeText()
    @IsString()
    @IsNotEmpty()
    name: string;

    // Exact values: no trimming, no case folding
    @IsIn(WEIGHT_CLASSES)
    weightClass: WeightClass;

    @NormalizeText()
    @IsString()
    @IsNotEmpty()
    team: string;

    @IsUUID()
    championshipId: string;
}
