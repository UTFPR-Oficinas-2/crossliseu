import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, apiRequest, setUnauthorizedHandler } from '../client'

function respond(status: number, body: unknown = { message: 'Unauthorized' }) {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status })),
  )
}

describe('apiRequest 401 handling', () => {
  const handler = vi.fn<() => void>()

  beforeEach(() => {
    handler.mockReset()
    setUnauthorizedHandler(handler)
  })

  afterEach(() => {
    setUnauthorizedHandler(null)
    vi.unstubAllGlobals()
  })

  it('calls the handler on a 401 when a token was sent', async () => {
    respond(401)

    await expect(
      apiRequest('/championships', { method: 'POST', token: 't' }),
    ).rejects.toBeInstanceOf(ApiError)

    expect(handler).toHaveBeenCalledOnce()
  })

  it('does not call the handler on a 401 without a token', async () => {
    respond(401)

    await expect(
      apiRequest('/auth/login', { method: 'POST', body: { username: 'a', password: 'b' } }),
    ).rejects.toMatchObject({ status: 401 })

    expect(handler).not.toHaveBeenCalled()
  })

  it('does not call the handler on other errors', async () => {
    respond(403, { message: 'Forbidden' })

    await expect(apiRequest('/users', { token: 't' })).rejects.toMatchObject({ status: 403 })

    expect(handler).not.toHaveBeenCalled()
  })
})
