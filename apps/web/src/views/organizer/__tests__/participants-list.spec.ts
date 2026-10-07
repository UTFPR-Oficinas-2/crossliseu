import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import type { Robot } from '@/types'
import {
  REMOVE_MESSAGES,
  describeRemoveError,
  filterRobots,
  participantsSubtitle,
} from '../participants-list'

const robot = (name: string, team: string): Robot => ({
  id: name,
  championshipId: 'c1',
  name,
  team,
  weightClass: 'lightweight',
  createdAt: '',
  modifiedAt: '',
})

const robots = [
  robot('Titã', 'Equipe Volt'),
  robot('Aço', 'Equipe Aço'),
  robot('Marte', 'equipe volt'),
]

describe('participantsSubtitle', () => {
  it('counts robots and distinct teams, ignoring case', () => {
    expect(participantsSubtitle(robots)).toBe('3 robôs inscritos · 2 equipes')
  })

  it('uses singulars', () => {
    expect(participantsSubtitle([robots[0]!])).toBe('1 robô inscrito · 1 equipe')
  })
})

describe('filterRobots', () => {
  it('returns everything for a blank query', () => {
    expect(filterRobots(robots, '   ')).toBe(robots)
  })

  it('matches the robot name or the team, ignoring case and accents', () => {
    expect(filterRobots(robots, 'ACO').map((r) => r.name)).toEqual(['Aço'])
    expect(filterRobots(robots, ' volt ').map((r) => r.name)).toEqual(['Titã', 'Marte'])
    expect(filterRobots(robots, 'tita').map((r) => r.name)).toEqual(['Titã'])
    expect(filterRobots(robots, 'zzz')).toEqual([])
  })
})

describe('describeRemoveError', () => {
  it('explains a robot that is in a match', () => {
    const error = new ApiError(409, 'robot_has_matches', ['robot_has_matches'])
    expect(describeRemoveError(error, 'Titã')).toBe(REMOVE_MESSAGES.hasMatches('Titã'))
  })

  it('handles network and unknown failures', () => {
    expect(describeRemoveError(new ApiError(0, 'Failed to fetch'), 'Titã')).toBe(
      REMOVE_MESSAGES.noConnection,
    )
    expect(describeRemoveError(new Error('boom'), 'Titã')).toBe(REMOVE_MESSAGES.generic('Titã'))
  })
})
