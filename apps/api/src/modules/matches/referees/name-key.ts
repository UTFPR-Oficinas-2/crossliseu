import { normalizeText } from '../../robots/dto/normalize.js';

/**
 * What two referee names are compared by: spacing, case and accents ignored, so " João " and
 * "joao" are the same referee. Computed here only, so the API and the database never disagree.
 */
export function nameKey(name: string): string {
    return normalizeText(name)
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase();
}
