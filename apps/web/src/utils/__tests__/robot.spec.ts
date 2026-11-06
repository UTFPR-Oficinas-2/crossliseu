import { describe, expect, it } from 'vitest'
import { WEIGHT_CLASSES, isWeightClass, normalizeText } from '../robot'

describe('normalizeText', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeText('  Equipe \t  Volt  ')).toBe('Equipe Volt')
  })
})

describe('weight classes', () => {
  it('lists the API weight classes in API order', () => {
    expect(WEIGHT_CLASSES).toEqual([
      'fairyweight',
      'antweight',
      'beetleweight',
      'hobbyweight',
      'featherweight',
      'lightweight',
    ])
    expect(isWeightClass('heavyweight')).toBe(false)
  })

  it('recognizes only the exact values', () => {
    expect(isWeightClass('beetleweight')).toBe(true)
    expect(isWeightClass('Beetleweight')).toBe(false)
    expect(isWeightClass('3 kg')).toBe(false)
    expect(isWeightClass('')).toBe(false)
  })
})
