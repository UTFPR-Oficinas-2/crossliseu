// Robot rules shared by the participant screens, the match form and the demo data layer. Mirrors
// apps/api/src/modules/robots (`dto/normalize.ts`, `weight-class.ts`), so the form preview and
// demo mode store exactly what the API would.
import type { WeightClass } from '@/types'

/** Trims and collapses whitespace runs: "  Equipe   Volt " → "Equipe Volt" */
export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

/** Same values and order as `WEIGHT_CLASSES` in apps/api. Shown as is, never translated. */
export const WEIGHT_CLASSES: readonly WeightClass[] = [
  'fairyweight',
  'antweight',
  'beetleweight',
  'hobbyweight',
  'featherweight',
  'lightweight',
]

export function isWeightClass(value: string): value is WeightClass {
  return (WEIGHT_CLASSES as readonly string[]).includes(value)
}
