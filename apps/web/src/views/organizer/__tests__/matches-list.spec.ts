import { describe, expect, it } from 'vitest'
import type { MatchSummary, Robot } from '@/types'
import { inMatchFilter, matchFilterFrom, matchRows, matchesSubtitle } from '../matches-list'

describe('matchFilterFrom', () => {
  it('reads known tabs and falls back to all', () => {
    expect(matchFilterFrom('waiting')).toBe('waiting')
    expect(matchFilterFrom('running')).toBe('running')
    expect(matchFilterFrom('finished')).toBe('finished')
    expect(matchFilterFrom('paused')).toBe('all')
    expect(matchFilterFrom(['waiting'])).toBe('all')
    expect(matchFilterFrom(undefined)).toBe('all')
  })
})

describe('inMatchFilter', () => {
  it('puts running and paused fights under "Em andamento"', () => {
    expect(inMatchFilter('running', 'running')).toBe(true)
    expect(inMatchFilter('paused', 'running')).toBe(true)
    expect(inMatchFilter('waiting', 'running')).toBe(false)
    expect(inMatchFilter('waiting', 'waiting')).toBe(true)
    expect(inMatchFilter('finished', 'finished')).toBe(true)
    expect(inMatchFilter('finished', 'all')).toBe(true)
  })
})

describe('matchesSubtitle', () => {
  it('counts matches with the Figma copy', () => {
    expect(matchesSubtitle(15)).toBe('15 lutas · montadas manualmente, sem chaveamento automático.')
    expect(matchesSubtitle(1)).toBe('1 luta · montadas manualmente, sem chaveamento automático.')
  })
})

describe('matchRows', () => {
  it('pairs each match with its robot names', () => {
    const robot = (id: string, name: string): Robot => ({
      id,
      championshipId: 'c1',
      name,
      team: 'Equipe',
      weightClass: 'lightweight',
      createdAt: '',
      modifiedAt: '',
    })
    const match: MatchSummary = {
      id: 'm1',
      championshipId: 'c1',
      weightClass: 'lightweight',
      robotAId: 'r1',
      robotBId: 'gone',
      state: 'waiting',
      createdAt: '',
      modifiedAt: '',
    }

    expect(matchRows([match], [robot('r1', 'Titã')])).toEqual([
      { match, robotA: 'Titã', robotB: 'Robô removido' },
    ])
  })
})
