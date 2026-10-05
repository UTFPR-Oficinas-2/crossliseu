import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { TOKEN_STORAGE_KEY, useAuthStore } from '../auth'

vi.mock('@/mocks', () => ({ signIn: vi.fn<(u: string, p: string) => Promise<string>>() }))
import { signIn as requestSignIn } from '@/mocks'

function makeToken(payload: object): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${encode({ alg: 'none' })}.${encode(payload)}.sig`
}

const nowSeconds = () => Math.floor(Date.now() / 1000)
const liveToken = (username = 'admin') =>
  makeToken({ sub: '1', username, iat: nowSeconds(), exp: nowSeconds() + 7200 })

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.mocked(requestSignIn).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('persists the token on sign-in', async () => {
    const token = liveToken()
    vi.mocked(requestSignIn).mockResolvedValue(token)
    const auth = useAuthStore()

    await auth.signIn('admin', 'secret')

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.username).toBe('admin')
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(token)
  })

  it('restores a live token on init', () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, liveToken('maria'))
    expect(useAuthStore().username).toBe('maria')
  })

  it('drops a token whose exp is in the past on init', () => {
    const expired = makeToken({ sub: '1', username: 'admin', exp: nowSeconds() - 10 })
    localStorage.setItem(TOKEN_STORAGE_KEY, expired)

    const auth = useAuthStore()

    expect(auth.isAuthenticated).toBe(false)
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('treats a garbage token as signed out', () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'not-a-jwt')

    const auth = useAuthStore()

    expect(auth.isAuthenticated).toBe(false)
    expect(auth.payload).toBeNull()
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('clears state and storage on sign-out', async () => {
    vi.mocked(requestSignIn).mockResolvedValue(liveToken())
    const auth = useAuthStore()
    await auth.signIn('admin', 'secret')

    auth.signOut()

    expect(auth.isAuthenticated).toBe(false)
    expect(auth.token).toBeNull()
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('signs out when the token expires', async () => {
    vi.useFakeTimers()
    vi.mocked(requestSignIn).mockResolvedValue(liveToken())
    const auth = useAuthStore()
    await auth.signIn('admin', 'secret')

    vi.advanceTimersByTime(7200 * 1000 + 1000)

    expect(auth.isAuthenticated).toBe(false)
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('keeps the session when sign-in fails', async () => {
    vi.mocked(requestSignIn).mockRejectedValue(new Error('401'))
    const auth = useAuthStore()

    await expect(auth.signIn('admin', 'wrong')).rejects.toThrow('401')

    expect(auth.isAuthenticated).toBe(false)
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })
})
