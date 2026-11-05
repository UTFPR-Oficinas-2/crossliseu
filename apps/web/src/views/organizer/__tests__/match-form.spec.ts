import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import type { Robot, WeightClass } from '@/types'
import {
  MATCH_MESSAGES,
  describeSaveError,
  matchPreview,
  robotHint,
  robotOptions,
  robotsInClass,
  toLocalInput,
  toMatchInput,
  toScheduledAtIso,
  validateMatchForm,
  validateStep1,
  withWeightClass,
  type MatchFormValues,
} from '../match-form'

const robot = (id: string, name: string, team: string, weightClass: WeightClass): Robot => ({
  id,
  championshipId: 'c1',
  name,
  team,
  weightClass,
  createdAt: '',
  modifiedAt: '',
})

const robots = [
  robot('tita', 'Titã', 'Equipe Volt', 'beetleweight'),
  robot('marte', 'Marte', 'Equipe Órbita', 'beetleweight'),
  robot('cobalto', 'Cobalto', 'Equipe Órbita', 'beetleweight'),
  robot('bigorna', 'Bigorna', 'Equipe Bigorna', 'antweight'),
]

const values = (overrides: Partial<MatchFormValues> = {}): MatchFormValues => ({
  weightClass: 'beetleweight',
  scheduledAt: '2026-12-09T14:30',
  robotAId: '',
  robotBId: '',
  ...overrides,
})

describe('scheduledAt conversion', () => {
  it('round-trips a datetime-local value through ISO', () => {
    expect(toLocalInput(toScheduledAtIso('2026-12-09T14:30'))).toBe('2026-12-09T14:30')
  })

  it('sends a full ISO timestamp', () => {
    expect(toScheduledAtIso('2026-12-09T14:30')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/)
  })
})

describe('validateStep1', () => {
  it('requires the category and the time', () => {
    expect(validateStep1(values({ weightClass: '', scheduledAt: '' }))).toEqual({
      weightClass: 'Escolha a categoria de peso.',
      scheduledAt: 'Informe a data e o horário.',
    })
  })

  it('accepts both', () => {
    expect(validateStep1(values())).toEqual({})
  })
})

describe('robotOptions', () => {
  it('lists only robots of the chosen class and disables the one picked as Robô 2', () => {
    const { groupLabel, options } = robotOptions(robots, values({ robotBId: 'marte' }), 'robotAId')

    expect(groupLabel).toBe('Participantes · beetleweight')
    expect(options.map((o) => o.value)).toEqual(['tita', 'marte', 'cobalto'])
    expect(options[0]).toMatchObject({
      label: 'Titã',
      meta: 'Equipe Volt · beetleweight',
      disabled: false,
    })
    expect(options[1]).toMatchObject({
      disabled: true,
      disabledReason: 'Já escolhido como Robô 2',
    })
  })

  it('disables Robô 1 in the Robô 2 menu', () => {
    const { options } = robotOptions(robots, values({ robotAId: 'marte' }), 'robotBId')

    expect(options[1]).toMatchObject({
      disabled: true,
      disabledReason: 'Já escolhido como Robô 1',
    })
  })

  it('lists another class when the category changes', () => {
    const { options } = robotOptions(robots, values({ weightClass: 'antweight' }), 'robotBId')

    expect(options.map((o) => o.value)).toEqual(['bigorna'])
  })
})

describe('robotsInClass', () => {
  it('counts the robots a category can pair', () => {
    expect(robotsInClass(robots, 'beetleweight')).toHaveLength(3)
    expect(robotsInClass(robots, 'antweight')).toHaveLength(1)
    expect(robotsInClass(robots, '')).toEqual([])
  })
})

describe('withWeightClass', () => {
  it('drops picked robots of another class', () => {
    expect(
      withWeightClass(robots, values({ robotAId: 'marte', robotBId: 'cobalto' }), 'antweight'),
    ).toMatchObject({ weightClass: 'antweight', robotAId: '', robotBId: '' })
  })

  it('keeps robots of the same class', () => {
    expect(
      withWeightClass(robots, values({ robotAId: 'marte', robotBId: 'cobalto' }), 'beetleweight'),
    ).toMatchObject({ robotAId: 'marte', robotBId: 'cobalto' })
  })
})

describe('robotHint', () => {
  it('shows the team and weight class of the picked robot', () => {
    expect(robotHint(robots, 'marte')).toBe('Equipe Órbita · beetleweight')
    expect(robotHint(robots, '')).toBeUndefined()
  })
})

describe('validateMatchForm', () => {
  it('requires both robots', () => {
    expect(validateMatchForm(robots, values())).toEqual({
      robotAId: MATCH_MESSAGES.robotARequired,
      robotBId: MATCH_MESSAGES.robotBRequired,
    })
  })

  it('rejects the same robot twice and mixed weight classes', () => {
    expect(validateMatchForm(robots, values({ robotAId: 'tita', robotBId: 'tita' }))).toEqual({
      robotBId: MATCH_MESSAGES.mustDiffer,
    })
    expect(validateMatchForm(robots, values({ robotAId: 'tita', robotBId: 'bigorna' }))).toEqual({
      robotBId: MATCH_MESSAGES.weightClassMismatch,
    })
  })

  it('accepts two robots of the same class', () => {
    expect(validateMatchForm(robots, values({ robotAId: 'marte', robotBId: 'cobalto' }))).toEqual(
      {},
    )
  })
})

describe('toMatchInput', () => {
  it('sends the robots and the ISO time', () => {
    expect(toMatchInput(values({ robotAId: 'marte', robotBId: 'cobalto' }))).toEqual({
      robotAId: 'marte',
      robotBId: 'cobalto',
      scheduledAt: toScheduledAtIso('2026-12-09T14:30'),
    })
  })
})

describe('matchPreview', () => {
  it('shows names, teams and the weight class', () => {
    expect(matchPreview(robots, values({ robotAId: 'marte', robotBId: 'cobalto' }))).toEqual({
      robotA: 'Marte',
      robotB: 'Cobalto',
      teams: 'Equipe Órbita × Equipe Órbita · beetleweight',
    })
  })

  it('uses stand-ins before the robots are picked', () => {
    expect(matchPreview(robots, values({ weightClass: '' }))).toEqual({
      robotA: 'Robô 1',
      robotB: 'Robô 2',
      teams: 'Equipe × Equipe',
    })
  })
})

describe('describeSaveError', () => {
  const apiError = (status: number, code: string) => new ApiError(status, code, [code])

  it('maps pair errors to Robô 2', () => {
    expect(describeSaveError(apiError(400, 'match_weight_class_mismatch'))).toEqual({
      message: MATCH_MESSAGES.reviewFields,
      fields: { robotBId: MATCH_MESSAGES.weightClassMismatch },
    })
    expect(describeSaveError(apiError(400, 'match_robots_must_differ')).fields).toEqual({
      robotBId: MATCH_MESSAGES.mustDiffer,
    })
  })

  it('maps state and membership errors to the banner', () => {
    expect(describeSaveError(apiError(409, 'match_not_editable'))).toEqual({
      message: MATCH_MESSAGES.notEditable,
      fields: {},
    })
    expect(describeSaveError(apiError(400, 'robot_not_in_championship')).message).toBe(
      MATCH_MESSAGES.notInChampionship,
    )
    expect(describeSaveError(apiError(404, 'robot_not_found')).message).toBe(
      MATCH_MESSAGES.robotNotFound,
    )
    expect(describeSaveError(apiError(404, 'match_not_found')).message).toBe(
      MATCH_MESSAGES.matchNotFound,
    )
    expect(describeSaveError(apiError(404, 'championship_not_found'))).toEqual({
      message: 'Este campeonato não existe mais. Volte para meus campeonatos.',
      fields: {},
    })
  })

  it('falls back per action', () => {
    expect(describeSaveError(new ApiError(0, 'offline')).message).toBe(MATCH_MESSAGES.noConnection)
    expect(describeSaveError(new Error('boom')).message).toBe(MATCH_MESSAGES.generic)
    expect(describeSaveError(new Error('boom'), MATCH_MESSAGES.deleteGeneric).message).toBe(
      MATCH_MESSAGES.deleteGeneric,
    )
  })
})
