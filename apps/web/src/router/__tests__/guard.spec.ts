import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { TOKEN_STORAGE_KEY } from '@/stores/auth'
import { liveToken } from '@/stores/__tests__/token-helpers'
import router, { safeRedirect } from '../index'

vi.mock('@/data', () => ({
  ownsChampionship: vi.fn<(id: string, token: string) => Promise<boolean>>(),
  matchChampionshipId: vi.fn<(id: string) => Promise<string | null>>(),
}))
import { matchChampionshipId, ownsChampionship } from '@/data'

describe('router guard', () => {
  beforeEach(async () => {
    localStorage.clear()
    setActivePinia(createPinia())
    await router.push('/')
  })

  it('sends a signed-out visit to a protected route to sign-in with a redirect', async () => {
    await router.push('/manage/new')

    expect(router.currentRoute.value.name).toBe('sign-in')
    expect(router.currentRoute.value.query.redirect).toBe('/manage/new')
  })

  it('lets a signed-in visit through to a protected route', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, liveToken())
    setActivePinia(createPinia())

    await router.push('/manage/new')

    expect(router.currentRoute.value.name).toBe('championship-create')
  })

  it('sends a signed-in visit to sign-in back home', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, liveToken())
    setActivePinia(createPinia())

    await router.push('/sign-in')

    expect(router.currentRoute.value.name).toBe('home')
  })

  it('does not protect referee routes', async () => {
    await router.push('/referee/some-token')

    expect(router.currentRoute.value.name).toBe('referee-session')
  })
})

describe('ownership guard', () => {
  const token = liveToken()

  beforeEach(async () => {
    localStorage.clear()
    setActivePinia(createPinia())
    await router.push('/')
    vi.mocked(ownsChampionship).mockReset()
    vi.mocked(matchChampionshipId).mockReset()
    vi.mocked(ownsChampionship).mockImplementation((id) => Promise.resolve(id === 'mine'))
    vi.mocked(matchChampionshipId).mockImplementation((id) =>
      Promise.resolve(id === 'm-mine' ? 'mine' : id === 'm-other' ? 'other' : null),
    )
  })

  function signIn() {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
    setActivePinia(createPinia())
  }

  it('opens a managed championship the account owns', async () => {
    signIn()

    await router.push('/manage/mine/participants')

    expect(router.currentRoute.value.name).toBe('championship-participants')
    expect(ownsChampionship).toHaveBeenCalledWith('mine', token)
  })

  it('follows the bare championship redirect for an owned championship', async () => {
    signIn()

    await router.push('/manage/mine')

    expect(router.currentRoute.value.name).toBe('championship-participants')
  })

  it('sends a championship of another account to not-found', async () => {
    signIn()

    await router.push('/manage/other/participants')

    expect(router.currentRoute.value.name).toBe('not-found')
  })

  it('sends a malformed championship id to not-found without throwing', async () => {
    signIn()

    await router.push('/manage/not-a-uuid/participants')

    expect(router.currentRoute.value.name).toBe('not-found')
  })

  it('does not check ownership on routes without a championship', async () => {
    signIn()

    await router.push('/manage/new')

    expect(router.currentRoute.value.name).toBe('championship-create')
    expect(ownsChampionship).not.toHaveBeenCalled()
  })

  it('opens the operator screen of a match in an owned championship', async () => {
    signIn()

    await router.push('/operator/m-mine')

    expect(router.currentRoute.value.name).toBe('match-operation')
  })

  it('sends the operator screen of another account match to not-found', async () => {
    signIn()

    await router.push('/operator/m-other')

    expect(router.currentRoute.value.name).toBe('not-found')
  })

  it('sends an unknown match to not-found', async () => {
    signIn()

    await router.push('/operator/m-unknown')

    expect(router.currentRoute.value.name).toBe('not-found')
  })

  it('still sends a signed-out visit to sign-in, without checking ownership', async () => {
    await router.push('/manage/mine/participants')

    expect(router.currentRoute.value.name).toBe('sign-in')
    expect(ownsChampionship).not.toHaveBeenCalled()
    expect(matchChampionshipId).not.toHaveBeenCalled()
  })

  it('lets the navigation through when the check fails; the API still refuses writes', async () => {
    signIn()
    vi.mocked(ownsChampionship).mockRejectedValueOnce(new Error('network'))
    vi.mocked(matchChampionshipId).mockRejectedValueOnce(new Error('network'))

    await router.push('/manage/other/participants')
    expect(router.currentRoute.value.name).toBe('championship-participants')

    await router.push('/operator/m-other')
    expect(router.currentRoute.value.name).toBe('match-operation')
  })
})

describe('safeRedirect', () => {
  it.each([
    ['/manage', '/manage'],
    ['/manage/abc?tab=1', '/manage/abc?tab=1'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['https://evil.com', '/'],
    ['javascript:alert(1)', '/'],
    ['', '/'],
    [undefined, '/'],
    [['/manage'], '/'],
  ])('%j -> %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected)
  })
})
