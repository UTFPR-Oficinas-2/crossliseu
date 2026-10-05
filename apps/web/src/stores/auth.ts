import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { signIn as requestSignIn } from '@/mocks'

export const TOKEN_STORAGE_KEY = 'crossliseu.token'

// setTimeout stores its delay as a signed 32-bit integer; larger values fire immediately
const MAX_TIMEOUT_MS = 2 ** 31 - 1

interface TokenPayload {
  sub: string
  username: string
  /** Expiry, in seconds since the epoch */
  exp: number
}

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token)
    else localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    // Storage can be blocked (private mode); the session just won't survive a reload
  }
}

/** Reads the (unverified) JWT payload. Returns null when the token can't be parsed. */
function decodePayload(token: string): TokenPayload | null {
  try {
    const segment = token.split('.')[1]
    if (!segment) return null
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    const json = new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
    const data = JSON.parse(json) as Partial<TokenPayload> | null
    if (
      typeof data?.sub !== 'string' ||
      typeof data.username !== 'string' ||
      typeof data.exp !== 'number'
    ) {
      return null
    }
    return { sub: data.sub, username: data.username, exp: data.exp }
  } catch {
    return null
  }
}

function isLive(payload: TokenPayload | null): payload is TokenPayload {
  return payload !== null && payload.exp * 1000 > Date.now()
}

// Frontend-only session state: the API (`JwtAuthGuard`) decides what a token may do.
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null)
  let expiryTimer: ReturnType<typeof setTimeout> | undefined

  const payload = computed(() => (token.value ? decodePayload(token.value) : null))
  // `Date.now()` isn't reactive: the expiry timer below clears the token when `exp` passes
  const isAuthenticated = computed(() => isLive(payload.value))
  const username = computed(() => payload.value?.username ?? null)

  function clearExpiryTimer() {
    clearTimeout(expiryTimer)
    expiryTimer = undefined
  }

  function signOut() {
    clearExpiryTimer()
    token.value = null
    writeStoredToken(null)
  }

  function scheduleExpiry(exp: number) {
    clearExpiryTimer()
    const remaining = exp * 1000 - Date.now()
    expiryTimer = setTimeout(
      () => {
        // The delay was clamped: check again until the token really expired
        if (exp * 1000 > Date.now()) scheduleExpiry(exp)
        else signOut()
      },
      Math.min(Math.max(remaining, 0), MAX_TIMEOUT_MS),
    )
  }

  function setToken(value: string) {
    const parsed = decodePayload(value)
    if (!isLive(parsed)) {
      signOut()
      return
    }
    token.value = value
    writeStoredToken(value)
    scheduleExpiry(parsed.exp)
  }

  async function signIn(usernameInput: string, password: string) {
    setToken(await requestSignIn(usernameInput, password))
  }

  const stored = readStoredToken()
  if (stored) {
    setToken(stored)
  }

  return { token, payload, isAuthenticated, username, signIn, signOut }
})
