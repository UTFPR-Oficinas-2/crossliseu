import { describe, expect, it } from 'vitest'

import type { RouteLocationRaw } from 'vue-router'

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

describe('arenas route', () => {
  it('lives at /arenas and requires sign-in', () => {
    const resolved = router.resolve({ name: 'arenas' })

    expect(resolved.path).toBe('/arenas')
    expect(resolved.meta.requiresAuth).toBe(true)
  })

  it('sends the old /manage/arenas address to /arenas', () => {
    const resolved = router.resolve('/manage/arenas')

    expect(resolved.matched.at(-1)?.redirect).toEqual({ name: 'arenas' })
  })
})

describe('championship management entry', () => {
  it('sends /manage/:id to the participants list', () => {
    // resolve() doesn't follow redirects (push does, but the auth guard would intercept it)
    const resolved = router.resolve('/manage/abc')
    const redirect = resolved.matched.at(-1)?.redirect

    expect(typeof redirect).toBe('function')
    expect(
      router.resolve((redirect as (to: typeof resolved) => RouteLocationRaw)(resolved)),
    ).toMatchObject({
      name: 'championship-participants',
      path: '/manage/abc/participants',
    })
  })

  it('has no overview page', () => {
    expect(router.hasRoute('championship-overview')).toBe(false)
  })
})
