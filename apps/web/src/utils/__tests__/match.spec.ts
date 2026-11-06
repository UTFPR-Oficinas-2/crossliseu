import { describe, expect, it } from 'vitest'
import { endReasonLabel, matchStatePill } from '../match'

describe('matchStatePill', () => {
  it('maps each API match state to its label and tone', () => {
    expect(matchStatePill.scheduled).toEqual({ label: 'Programada', tone: 'info' })
    expect(matchStatePill.ongoing).toEqual({ label: 'Em andamento', tone: 'accent' })
    expect(matchStatePill.paused).toEqual({ label: 'Pausada', tone: 'warning' })
    expect(matchStatePill.finished).toEqual({ label: 'Encerrada', tone: 'success' })
  })
})

describe('endReasonLabel', () => {
  it('labels a time-out and an operator stop', () => {
    expect(endReasonLabel('time_out', 'A')).toBe('Tempo esgotado')
    expect(endReasonLabel('manual', null)).toBe('Encerrada pelo operador')
  })

  it('names the side that surrendered: the loser', () => {
    expect(endReasonLabel('surrender', 'A')).toBe('Desistência do lado B')
    expect(endReasonLabel('surrender', 'B')).toBe('Desistência do lado A')
  })
})
