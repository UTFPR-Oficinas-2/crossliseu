import { PartialType } from '@nestjs/swagger';
import { CreateChampionshipDto } from './create-championship.dto.js';

export class UpdateChampionshipDto extends PartialType(CreateChampionshipDto) {}
