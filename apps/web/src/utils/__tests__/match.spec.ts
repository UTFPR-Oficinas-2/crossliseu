import { describe, expect, it } from 'vitest'
import { matchStatePill } from '../match'

describe('matchStatePill', () => {
  it('maps each match state to the Figma 10 label and tone', () => {
    expect(matchStatePill.waiting).toEqual({ label: 'Programada', tone: 'info' })
    expect(matchStatePill.running).toEqual({ label: 'Em andamento', tone: 'accent' })
    expect(matchStatePill.paused).toEqual({ label: 'Em andamento', tone: 'accent' })
    expect(matchStatePill.finished).toEqual({ label: 'Encerrada', tone: 'success' })
  })
})
