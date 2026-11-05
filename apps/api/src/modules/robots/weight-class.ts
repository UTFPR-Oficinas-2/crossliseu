/**
 * The only weight classes; a match pairs two robots of the same class. The DTOs enforce them
 * on write and CHECK constraints in the baseline migration enforce them in Postgres, so
 * changing this list needs a new migration.
 */
export const WEIGHT_CLASSES = [
    'fairyweight',
    'antweight',
    'beetleweight',
    'hobbyweight',
    'featherweight',
    'lightweight',
] as const;

export type WeightClass = (typeof WEIGHT_CLASSES)[number];
