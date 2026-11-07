import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearArenaCurrentMatch,
  createArena,
  deleteArena,
  listArenas,
  renameArena,
  rotateArenaToken,
} from '@/api/arenas'

function stubFetch(status: number, body?: unknown) {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function lastCall(fetchMock: ReturnType<typeof stubFetch>) {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return { url, init, headers: init.headers as Record<string, string> }
}

describe('api/arenas', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists arenas with the bearer token', async () => {
    const fetchMock = stubFetch(200, [])

    expect(await listArenas('t')).toEqual([])
    const { url, init, headers } = lastCall(fetchMock)
    expect(url.endsWith('/arenas')).toBe(true)
    expect(init.method).toBe('GET')
    expect(headers.Authorization).toBe('Bearer t')
  })

  it('creates with POST and the name', async () => {
    const fetchMock = stubFetch(201, { arena: {}, credentials: {} })

    await createArena('Garagem', 't')
    const { url, init } = lastCall(fetchMock)
    expect(url.endsWith('/arenas')).toBe(true)
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ name: 'Garagem' }))
  })

  it('renames with PATCH', async () => {
    const fetchMock = stubFetch(200, {})

    await renameArena('a/1', 'Nova', 't')
    const { url, init } = lastCall(fetchMock)
    expect(url.endsWith('/arenas/a%2F1')).toBe(true)
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe(JSON.stringify({ name: 'Nova' }))
  })

  it('rotates the token with POST /arenas/:id/token', async () => {
    const fetchMock = stubFetch(200, {})

    await rotateArenaToken('a1', 't')
    const { url, init } = lastCall(fetchMock)
    expect(url.endsWith('/arenas/a1/token')).toBe(true)
    expect(init.method).toBe('POST')
  })

  it('deletes with DELETE and accepts 204', async () => {
    const fetchMock = stubFetch(204)

    await expect(deleteArena('a1', 't')).resolves.toBeUndefined()
    const { url, init } = lastCall(fetchMock)
    expect(url.endsWith('/arenas/a1')).toBe(true)
    expect(init.method).toBe('DELETE')
  })

  it('clears the current match with DELETE /arenas/:id/current-match', async () => {
    const fetchMock = stubFetch(200, {})

    await clearArenaCurrentMatch('a/1', 't')
    const { url, init } = lastCall(fetchMock)
    expect(url.endsWith('/arenas/a%2F1/current-match')).toBe(true)
    expect(init.method).toBe('DELETE')
  })
})
