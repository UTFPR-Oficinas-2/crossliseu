import { describe, expect, it } from 'vitest'

import router from '../index'

describe('organizer form routes', () => {
  it.each([
    [
      'participant-create',
      { championshipId: 'c1' },
      '/manage/c1/participants/new',
      'championship-participants',
    ],
    [
      'participant-edit',
      { championshipId: 'c1', robotId: 'r1' },
      '/manage/c1/participants/r1/edit',
      'championship-participants',
    ],
    ['match-create', { championshipId: 'c1' }, '/manage/c1/matches/new', 'championship-matches'],
    [
      'match-edit',
      { championshipId: 'c1', matchId: 'm1' },
      '/manage/c1/matches/m1/edit',
      'championship-matches',
    ],
  ])('%s resolves under its sidebar item and requires sign-in', (name, params, path, sidebar) => {
    const resolved = router.resolve({ name, params })

    expect(resolved.path).toBe(path)
    expect(resolved.meta.sidebar).toBe(sidebar)
    expect(resolved.meta.requiresAuth).toBe(true)
  })
})
