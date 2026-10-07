import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import type { Robot } from '@/types'
import {
  MATCH_MESSAGES,
  describeSaveError,
  matchPreview,
  pickRobot,
  robotHint,
  robotOptions,
  validateMatchForm,
} from '../match-form'

const robot = (id: string, name: string, team: string, weightClass: string): Robot => ({
  id,
  championshipId: 'c1',
  name,
  team,
  weightClass,
  createdAt: '',
  modifiedAt: '',
})

const robots = [
  robot('tita', 'Titã', 'Equipe Volt', 'lightweight'),
  robot('marte', 'Marte', 'Equipe Órbita', 'lightweight'),
  robot('cobalto', 'Cobalto', 'Equipe Órbita', 'lightweight'),
  robot('bigorna', 'Bigorna', 'Equipe Bigorna', 'heavyweight'),
]

describe('robotOptions', () => {
  it('lists every robot for Robô 1 and disables the one picked as Robô 2', () => {
    const { groupLabel, options } = robotOptions(
      robots,
      { robotAId: '', robotBId: 'marte' },
      'robotAId',
    )

    expect(groupLabel).toBe('Participantes')
    expect(options.map((o) => o.value)).toEqual(['tita', 'marte', 'cobalto', 'bigorna'])
    expect(options[0]).toMatchObject({
      label: 'Titã',
      meta: 'Equipe Volt · Peso leve',
      disabled: false,
    })
    expect(options[1]).toMatchObject({
      disabled: true,
      disabledReason: 'Já escolhido como Robô 2',
    })
  })

  it("lists only Robô 1's weight class for Robô 2 and disables Robô 1", () => {
    const { groupLabel, options } = robotOptions(
      robots,
      { robotAId: 'marte', robotBId: '' },
      'robotBId',
    )

    expect(groupLabel).toBe('Participantes · Peso leve')
    expect(options.map((o) => o.value)).toEqual(['tita', 'marte', 'cobalto'])
    expect(options[1]).toMatchObject({
      disabled: true,
      disabledReason: 'Já escolhido como Robô 1',
    })
  })

  it('lists every robot for Robô 2 until Robô 1 is picked', () => {
    const { groupLabel, options } = robotOptions(robots, { robotAId: '', robotBId: '' }, 'robotBId')

    expect(groupLabel).toBe('Participantes')
    expect(options).toHaveLength(4)
  })
})

describe('pickRobot', () => {
  it('clears Robô 2 when Robô 1 changes to another weight class', () => {
    expect(
      pickRobot(robots, { robotAId: 'marte', robotBId: 'cobalto' }, 'robotAId', 'bigorna'),
    ).toEqual({
      robotAId: 'bigorna',
      robotBId: '',
    })
  })

  it('keeps Robô 2 within the same class', () => {
    expect(
      pickRobot(robots, { robotAId: 'marte', robotBId: 'cobalto' }, 'robotAId', 'tita'),
    ).toEqual({
      robotAId: 'tita',
      robotBId: 'cobalto',
    })
  })

  it('sets Robô 2 as picked', () => {
    expect(pickRobot(robots, { robotAId: 'marte', robotBId: '' }, 'robotBId', 'cobalto')).toEqual({
      robotAId: 'marte',
      robotBId: 'cobalto',
    })
  })
})

describe('robotHint', () => {
  it('shows the team and weight class of the picked robot', () => {
    expect(robotHint(robots, 'marte')).toBe('Equipe Órbita · Peso leve')
    expect(robotHint(robots, '')).toBeUndefined()
  })
})

describe('validateMatchForm', () => {
  it('requires both robots', () => {
    expect(validateMatchForm(robots, { robotAId: '', robotBId: '' })).toEqual({
      robotAId: MATCH_MESSAGES.robotARequired,
      robotBId: MATCH_MESSAGES.robotBRequired,
    })
  })

  it('rejects the same robot twice and mixed weight classes', () => {
    expect(validateMatchForm(robots, { robotAId: 'tita', robotBId: 'tita' })).toEqual({
      robotBId: MATCH_MESSAGES.mustDiffer,
    })
    expect(validateMatchForm(robots, { robotAId: 'tita', robotBId: 'bigorna' })).toEqual({
      robotBId: MATCH_MESSAGES.weightClassMismatch,
    })
  })

  it('accepts two robots of the same class', () => {
    expect(validateMatchForm(robots, { robotAId: 'marte', robotBId: 'cobalto' })).toEqual({})
  })
})

describe('matchPreview', () => {
  it('shows names, teams and the weight class', () => {
    expect(matchPreview(robots, { robotAId: 'marte', robotBId: 'cobalto' })).toEqual({
      robotA: 'Marte',
      robotB: 'Cobalto',
      teams: 'Equipe Órbita × Equipe Órbita · Peso leve',
    })
  })

  it('uses stand-ins before the robots are picked', () => {
    expect(matchPreview(robots, { robotAId: '', robotBId: '' })).toEqual({
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
  })

  it('falls back per action', () => {
    expect(describeSaveError(new ApiError(0, 'offline')).message).toBe(MATCH_MESSAGES.noConnection)
    expect(describeSaveError(new Error('boom')).message).toBe(MATCH_MESSAGES.generic)
    expect(describeSaveError(new Error('boom'), MATCH_MESSAGES.deleteGeneric).message).toBe(
      MATCH_MESSAGES.deleteGeneric,
    )
  })
})
