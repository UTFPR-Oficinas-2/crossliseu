import { describe, expect, it } from 'vitest'
import { WEIGHT_CLASSES, isWeightClass, normalizeText, weightClassLabel } from '../robot'

describe('normalizeText', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeText('  Equipe \t  Volt  ')).toBe('Equipe Volt')
  })
})

describe('weight classes', () => {
  it('lists exactly the two classes the API accepts', () => {
    expect(WEIGHT_CLASSES).toEqual(['lightweight', 'heavyweight'])
  })

  it('recognizes only the exact values', () => {
    expect(isWeightClass('heavyweight')).toBe(true)
    expect(isWeightClass('Heavyweight')).toBe(false)
    expect(isWeightClass('3 kg')).toBe(false)
    expect(isWeightClass('')).toBe(false)
  })

  it('labels them in pt-BR and shows older values as stored', () => {
    expect(weightClassLabel('lightweight')).toBe('Peso leve')
    expect(weightClassLabel('heavyweight')).toBe('Peso pesado')
    expect(weightClassLabel('3 kg')).toBe('3 kg')
  })
})
