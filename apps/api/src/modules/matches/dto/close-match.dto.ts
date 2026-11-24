import { IsBoolean, IsOptional } from 'class-validator';

/**
 * POST /matches/:id/close confirms the official result (#50). With no body the server's proposal
 * is confirmed; `draw: true` ends the fight as a draw instead. The winner is never sent.
 */
export class CloseMatchDto {
    @IsOptional()
    @IsBoolean()
    draw?: boolean;
}
