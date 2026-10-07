import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMatch, deleteMatch, listMatches, updateMatch } from '../matches'
import { createRobot, deleteRobot, listRobots, updateRobot } from '../robots'

// A fresh Response per call: a body can only be read once
function stubFetch(status = 200, body: unknown = {}) {
  const fetchMock = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status })),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function lastRequest(fetchMock: ReturnType<typeof stubFetch>) {
  const [url, init] = fetchMock.mock.calls.at(-1)!
  const headers = (init?.headers ?? {}) as Record<string, string>
  return {
    url: String(url),
    method: init?.method,
    body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    authorization: headers.Authorization,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('robots API', () => {
  it('lists the robots of one championship', async () => {
    const fetchMock = stubFetch(200, [])

    await listRobots('c1')

    expect(lastRequest(fetchMock).url).toMatch(/\/robots\?championshipId=c1$/)
    expect(lastRequest(fetchMock).method).toBe('GET')
  })

  it('creates and updates with the token', async () => {
    const fetchMock = stubFetch()
    const body = {
      name: 'Titã',
      team: 'Equipe Volt',
      weightClass: 'lightweight' as const,
      championshipId: 'c1',
    }

    await createRobot(body, 'tok')
    expect(lastRequest(fetchMock)).toMatchObject({
      method: 'POST',
      body,
      authorization: 'Bearer tok',
    })
    expect(lastRequest(fetchMock).url).toMatch(/\/robots$/)

    await updateRobot('r 1', { name: 'Titã II' }, 'tok')
    expect(lastRequest(fetchMock)).toMatchObject({ method: 'PATCH', body: { name: 'Titã II' } })
    expect(lastRequest(fetchMock).url).toMatch(/\/robots\/r%201$/)
  })

  it('deletes with the token and resolves on 204', async () => {
    const fetchMock = stubFetch(204)

    await expect(deleteRobot('r1', 'tok')).resolves.toBeUndefined()

    expect(lastRequest(fetchMock)).toMatchObject({ method: 'DELETE', authorization: 'Bearer tok' })
    expect(lastRequest(fetchMock).url).toMatch(/\/robots\/r1$/)
  })
})

describe('matches API', () => {
  it('lists the matches of one championship', async () => {
    const fetchMock = stubFetch(200, [])

    await listMatches('c1')

    expect(lastRequest(fetchMock).url).toMatch(/\/matches\?championshipId=c1$/)
  })

  it('creates without a weight class and updates only the robots', async () => {
    const fetchMock = stubFetch()

    await createMatch({ championshipId: 'c1', robotAId: 'r1', robotBId: 'r2' }, 'tok')
    expect(lastRequest(fetchMock)).toMatchObject({
      method: 'POST',
      body: { championshipId: 'c1', robotAId: 'r1', robotBId: 'r2' },
      authorization: 'Bearer tok',
    })

    await updateMatch('m1', { robotBId: 'r3' }, 'tok')
    expect(lastRequest(fetchMock)).toMatchObject({ method: 'PATCH', body: { robotBId: 'r3' } })
    expect(lastRequest(fetchMock).url).toMatch(/\/matches\/m1$/)
  })

  it('deletes with the token', async () => {
    const fetchMock = stubFetch(204)

    await deleteMatch('m1', 'tok')

    expect(lastRequest(fetchMock)).toMatchObject({ method: 'DELETE', authorization: 'Bearer tok' })
  })
})
