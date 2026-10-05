import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { TOKEN_STORAGE_KEY } from '@/stores/auth'
import router, { safeRedirect } from '../index'

function liveToken(): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 7200
  return `${encode({ alg: 'none' })}.${encode({ sub: '1', username: 'admin', exp })}.sig`
}

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
