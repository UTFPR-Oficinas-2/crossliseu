import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import type { Arena, MatchState, MatchSummary, Robot } from '@/types'
import { arenaStatusPill, fightDisabled, fightOptions, pickErrorMessage } from '../arena-fight-pick'

const at = '2026-10-01T00:00:00.000Z'

function match(id: string, state: MatchState, scheduledAt: string): MatchSummary {
  return {
    id,
    championshipId: 'c1',
    weightClass: 'beetleweight',
    robotAId: 'r1',
    robotBId: 'r2',
    state,
    scheduledAt,
    createdAt: at,
    modifiedAt: at,
  }
}

function arena(id: string, currentMatchId: string | null, online = false): Arena {
  return { id, name: `Arena ${id}`, online, currentMatchId, currentMatch: null }
}

const robots: Robot[] = [
  {
    id: 'r1',
    championshipId: 'c1',
    name: 'Titã',
    team: 'Volt',
    weightClass: 'beetleweight',
    createdAt: at,
    modifiedAt: at,
  },
]

describe('fightOptions', () => {
  it('keeps only scheduled fights, earliest first', () => {
    const options = fightOptions(
      [
        match('late', 'scheduled', '2026-12-09T15:00:00.000Z'),
        match('live', 'ongoing', '2026-12-09T10:00:00.000Z'),
        match('paused', 'paused', '2026-12-09T10:00:00.000Z'),
        match('done', 'finished', '2026-12-09T09:00:00.000Z'),
        match('early', 'scheduled', '2026-12-09T13:00:00.000Z'),
      ],
      robots,
      [],
    )

    expect(options.map((o) => o.match.id)).toEqual(['early', 'late'])
  })

  it('names the robots, with "Robô removido" for a missing one', () => {
    const [option] = fightOptions([match('m1', 'scheduled', at)], robots, [])

    expect(option).toMatchObject({ robotA: 'Titã', robotB: 'Robô removido' })
  })

  it('marks the arena that holds the fight as its current match', () => {
    const holder = arena('a2', 'm1')
    const [held, free] = fightOptions(
      [match('m1', 'scheduled', at), match('m2', 'scheduled', '2026-12-09T15:00:00.000Z')],
      robots,
      [arena('a1', null), holder],
    )

    expect(held?.heldBy).toBe(holder)
    expect(free?.heldBy).toBeNull()
  })
})

describe('fightDisabled', () => {
  const [held] = fightOptions([match('m1', 'scheduled', at)], robots, [arena('a2', 'm1')])
  const [free] = fightOptions([match('m1', 'scheduled', at)], robots, [])

  it('allows a fight held by the selected arena', () => {
    expect(fightDisabled(held!, 'a2')).toBe(false)
  })

  it('blocks a fight held by another arena, or when no arena is selected', () => {
    expect(fightDisabled(held!, 'a1')).toBe(true)
    expect(fightDisabled(held!, null)).toBe(true)
  })

  it('allows a fight no arena holds', () => {
    expect(fightDisabled(free!, null)).toBe(false)
    expect(fightDisabled(free!, 'a1')).toBe(false)
  })
})

describe('arenaStatusPill', () => {
  it('shows connected arenas in green', () => {
    expect(arenaStatusPill(arena('a1', null, true))).toEqual({
      label: 'Conectada',
      tone: 'success',
    })
  })

  it('marks offline arenas as disconnected in red', () => {
    expect(arenaStatusPill(arena('a1', null))).toEqual({ label: 'Desconectada', tone: 'danger' })
  })
})

describe('pickErrorMessage', () => {
  const refused = (code: string, status = 409) => new ApiError(status, code, [code])

  it('explains each refusal of the pick', () => {
    expect(pickErrorMessage(refused('arena_match_started'))).toBe(
      'Esta arena já tem uma luta iniciada. Retome-a ou encerre-a antes.',
    )
    expect(pickErrorMessage(refused('match_already_current'))).toBe(
      'Esta luta já está aberta em outra arena.',
    )
    expect(pickErrorMessage(refused('match_not_scheduled'))).toBe(
      'Esta luta não está mais programada.',
    )
    expect(pickErrorMessage(refused('arena_not_found', 404))).toBe(
      'Arena ou luta não encontrada. Atualize a página.',
    )
    expect(pickErrorMessage(refused('match_not_found', 404))).toBe(
      'Arena ou luta não encontrada. Atualize a página.',
    )
  })

  it('falls back to a generic message', () => {
    const generic = 'Não foi possível abrir a luta. Tente novamente.'
    expect(pickErrorMessage(new Error('x'))).toBe(generic)
    expect(pickErrorMessage(new ApiError(500, 'boom'))).toBe(generic)
    expect(pickErrorMessage(new ApiError(409, 'toString', ['toString']))).toBe(generic)
  })
})
