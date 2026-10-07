import { Transform } from 'class-transformer';

/** Trims and collapses whitespace runs: "  Equipe   Volt " → "Equipe Volt" */
export function normalizeText(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
}

// Non-strings pass through untouched so @IsString still reports them
export const NormalizeText = () =>
    Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? normalizeText(value) : value,
    );
