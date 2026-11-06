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

describe('apiRequest error details', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('collects class-validator messages into details', async () => {
    respond(400, { statusCode: 400, message: ['name should not be empty'], error: 'Bad Request' })

    const error = await apiRequest('/championships').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, details: ['name should not be empty'] })
  })

  it('wraps a service error code as the message and a single detail', async () => {
    respond(400, { message: 'championship_end_before_start' })

    await expect(apiRequest('/championships')).rejects.toMatchObject({
      message: 'championship_end_before_start',
      details: ['championship_end_before_start'],
    })
  })

  it('has empty details on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')))

    await expect(apiRequest('/championships')).rejects.toMatchObject({ status: 0, details: [] })
  })
})
