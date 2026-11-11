import { afterEach, describe, expect, it, vi } from 'vitest'
import { markUploaded, requestUploadUrl } from '@/api/recordings'

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

describe('api/recordings', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('asks for an upload URL with the content type and the bearer token', async () => {
    const answer = { url: 'https://r2/x?sig=1', key: 'recordings/m1.mp4', expiresAt: '2026-01-01' }
    const fetchMock = stubFetch(200, answer)

    expect(await requestUploadUrl('m/1', 'video/mp4', 1234, 't')).toEqual(answer)
    const { url, init, headers } = lastCall(fetchMock)
    expect(url.endsWith('/matches/m%2F1/recording/upload-url')).toBe(true)
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ contentType: 'video/mp4', size: 1234 }))
    expect(headers.Authorization).toBe('Bearer t')
  })

  it('marks the upload complete with the key and the size', async () => {
    const fetchMock = stubFetch(204)

    await markUploaded('m1', { key: 'recordings/m1.mp4', size: 1234 }, 't')
    const { url, init } = lastCall(fetchMock)
    expect(url.endsWith('/matches/m1/recording/complete')).toBe(true)
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ key: 'recordings/m1.mp4', size: 1234 }))
  })
})
