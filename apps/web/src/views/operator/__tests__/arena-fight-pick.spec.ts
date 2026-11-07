import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import type { Arena, MatchState, MatchSummary, Robot } from '@/types'
import {
  actionHint,
  arenaChoice,
  fightDisabled,
  fightMeta,
  fightOptions,
  pickErrorMessage,
} from '../arena-fight-pick'

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

  it('names the robots and teams, with "Robô removido" for a missing one', () => {
    const [option] = fightOptions([match('m1', 'scheduled', at)], robots, [])

    expect(option).toMatchObject({
      robotA: 'Titã',
      robotB: 'Robô removido',
      teamA: 'Volt',
      teamB: 'Robô removido',
    })
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

describe('arenaChoice', () => {
  it('offers a free connected arena', () => {
    expect(arenaChoice(arena('a1', null, true))).toEqual({
      meta: 'Livre · caixa da arena conectada',
      pill: { label: 'Conectado', tone: 'success' },
      disabled: false,
    })
  })

  it('offers a free offline arena, marked but not blocked', () => {
    expect(arenaChoice(arena('a1', null))).toEqual({
      meta: 'Livre · a luta pode rodar sem a caixa, mas sem botões de desistência',
      pill: { label: 'Não conectado', tone: 'danger' },
      disabled: false,
    })
  })

  it('disables an arena that has a current fight and says which one', () => {
    const busy: Arena = {
      ...arena('a1', 'm9', true),
      currentMatch: { robotAName: 'Titã', robotBName: 'Nêmesis' },
    }

    expect(arenaChoice(busy)).toEqual({
      meta: 'Ocupada com Titã × Nêmesis. Feche essa luta para liberar a arena.',
      pill: { label: 'Em uso', tone: 'accent' },
      disabled: true,
    })
  })
})

describe('fightMeta', () => {
  it('shows the teams and the weight class', () => {
    const [option] = fightOptions([match('m1', 'scheduled', at)], robots, [])

    expect(fightMeta(option!)).toBe('Volt × Robô removido · beetleweight')
  })

  it('says which arena already has the fight open', () => {
    const [option] = fightOptions([match('m1', 'scheduled', at)], robots, [arena('a2', 'm1')])

    expect(fightMeta(option!)).toBe('Aberta na Arena a2')
  })
})

describe('actionHint', () => {
  it('asks for both picks until there is an arena', () => {
    expect(actionHint(null)).toBe('Escolha uma arena e uma luta.')
  })

  it('says the fight stays on the chosen arena', () => {
    expect(actionHint(arena('a1', null))).toBe(
      'A luta fica na Arena a1 até você fechá-la. A caixa da arena passa a mostrar os nomes e o tempo.',
    )
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
