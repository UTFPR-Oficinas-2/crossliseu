// Thin fetch wrapper for apps/api. The base URL comes from `VITE_API_URL` (e.g. `/api` in dev,
// proxied by Vite; `/crossliseu/api` in production, same origin via the host NGINX).
// When it is unset, `@/mocks` keeps serving demo data.
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? ''

export const isApiEnabled = API_URL !== ''

export class ApiError extends Error {
  /** HTTP status, or `0` when the request never got a response (network/CORS failure) */
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

interface RequestOptions {
  method?: HttpMethod
  body?: unknown
  /** JWT from `POST /auth/login`, required by every non-public route */
  token?: string
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    throw new ApiError(0, error instanceof Error ? error.message : 'Network error')
  }

  if (!response.ok) {
    // Nest errors look like `{ statusCode, message, error }`
    const payload = (await response.json().catch(() => null)) as { message?: unknown } | null
    const message = typeof payload?.message === 'string' ? payload.message : response.statusText
    throw new ApiError(response.status, message)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
