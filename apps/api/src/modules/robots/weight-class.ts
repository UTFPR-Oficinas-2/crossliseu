/**
 * The only weight classes for now (no kilograms); a match pairs two robots of the same class.
 * The DTOs enforce them on write. The column stays varchar, so the list can grow without a
 * migration, and rows saved before this rule may hold other text.
 */
export const WEIGHT_CLASSES = ['lightweight', 'heavyweight'] as const;

export type WeightClass = (typeof WEIGHT_CLASSES)[number];
