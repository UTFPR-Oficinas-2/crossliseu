import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../client'
import { joinReferee, submitScore } from '../referees'

function respond(status: number, body: unknown) {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function sent(fetchMock: ReturnType<typeof respond>) {
  const [url, init] = fetchMock.mock.calls[0]!
  return {
    url: String(url),
    method: init?.method,
    headers: init?.headers as Record<string, string>,
    body: JSON.parse(String(init?.body)) as unknown,
  }
}

describe('referee API', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('joins with the shared token and the name', async () => {
    const seat = { matchId: 'm-1', seat: 2, name: 'Ana', counts: { A: 1, B: 0 } }
    const fetchMock = respond(200, seat)

    await expect(joinReferee('tok', 'Ana')).resolves.toEqual(seat)

    const request = sent(fetchMock)
    expect(request.url).toMatch(/\/referee\/join$/)
    expect(request.method).toBe('POST')
    expect(request.body).toEqual({ token: 'tok', name: 'Ana' })
    expect(request.headers).not.toHaveProperty('Authorization')
  })

  it('submits one press for the match', async () => {
    const fetchMock = respond(201, { counts: { A: 0, B: 2 } })

    await expect(submitScore('m 1', 'tok', 'Ana', 'A', -1)).resolves.toEqual({
      counts: { A: 0, B: 2 },
    })

    const request = sent(fetchMock)
    expect(request.url).toMatch(/\/matches\/m%201\/scores$/)
    expect(request.method).toBe('POST')
    expect(request.body).toEqual({ token: 'tok', name: 'Ana', side: 'A', action: -1 })
    expect(request.headers).not.toHaveProperty('Authorization')
  })

  it('passes the abort signal to fetch', async () => {
    const fetchMock = respond(201, { counts: { A: 0, B: 0 } })
    const controller = new AbortController()

    await submitScore('m1', 'tok', 'Ana', 'A', 1, controller.signal)

    expect(fetchMock.mock.calls[0]![1]?.signal).toBe(controller.signal)
  })

  it('rejects with the server code', async () => {
    respond(409, { statusCode: 409, message: 'referee_seats_full', error: 'Conflict' })

    const error = await joinReferee('tok', 'Zé').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409 })
    expect((error as ApiError).details).toContain('referee_seats_full')
  })
})
