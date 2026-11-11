// Thin fetch wrapper for apps/api. The base URL comes from `VITE_API_URL` (e.g. `/api` in dev,
// proxied by Vite; `/crossliseu/api` in production, same origin via the host NGINX). It is
// required in every build and in the dev server (vite.config.ts fails without it), so the app
// never falls back to fake data.
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? ''

export class ApiError extends Error {
  /** HTTP status, or `0` when the request never got a response (network/CORS failure) */
  readonly status: number
  /** Nest error messages: class-validator returns one per failed rule, services return one code */
  readonly details: readonly string[]

  constructor(status: number, message: string, details: readonly string[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

type UnauthorizedHandler = () => void

let onUnauthorized: UnauthorizedHandler | null = null

/**
 * Called when a request that carried a token gets a 401 (expired or revoked session). A 401 on
 * a request without a token (wrong password on /auth/login) never triggers it. Registered once
 * in `main.ts`, so this module doesn't depend on the auth store.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions {
  method?: HttpMethod
  body?: unknown
  /** JWT from `POST /auth/login`, required by every non-public route */
  token?: string
  signal?: AbortSignal
  cache?: RequestCache
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, signal, cache } = options
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      signal,
      cache,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    throw new ApiError(0, error instanceof Error ? error.message : 'Network error')
  }

  if (!response.ok) {
    if (response.status === 401 && token) onUnauthorized?.()
    // Nest errors look like `{ statusCode, message, error }`
    const payload = (await response.json().catch(() => null)) as { message?: unknown } | null
    const raw = payload?.message
    const details = Array.isArray(raw)
      ? raw.filter((item): item is string => typeof item === 'string')
      : typeof raw === 'string'
        ? [raw]
        : []
    const message = typeof raw === 'string' ? raw : response.statusText
    throw new ApiError(response.status, message, details)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
