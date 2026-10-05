// Demo sign-in for development without `VITE_API_URL`. Loaded only through `demo()` in
// `./index.ts`, so it never reaches production bundles. The token is unsigned: the API is not
// involved and nothing verifies it.
import { ApiError } from '@/api/client'

const DEMO_USERNAME = 'organizador'
const DEMO_PASSWORD = 'crossliseu'
const TOKEN_LIFETIME_SECONDS = 2 * 60 * 60

function base64url(value: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function demoSignIn(username: string, password: string): string {
  if (username !== DEMO_USERNAME || password !== DEMO_PASSWORD) {
    throw new ApiError(401, 'Unauthorized')
  }
  const now = Math.floor(Date.now() / 1000)
  const header = base64url({ alg: 'none', typ: 'JWT' })
  const payload = base64url({
    sub: 'demo-organizer',
    username,
    iat: now,
    exp: now + TOKEN_LIFETIME_SECONDS,
  })
  return `${header}.${payload}.demo`
}
