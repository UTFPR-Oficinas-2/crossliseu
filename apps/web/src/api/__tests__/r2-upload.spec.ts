import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UploadError, uploadToR2 } from '@/api/r2-upload'

/** Stand-in for XMLHttpRequest: records what was sent and lets each test decide the outcome */
class FakeXhr {
  static last: FakeXhr | null = null

  method = ''
  url = ''
  headers: Record<string, string> = {}
  body: unknown = null
  status = 0
  upload: { onprogress: ((event: Partial<ProgressEvent>) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null

  constructor() {
    FakeXhr.last = this
  }

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }

  send(body: unknown) {
    this.body = body
  }

  abort() {
    this.onabort?.()
  }

  // Helpers for the tests
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total })
  }

  respond(status: number) {
    this.status = status
    this.onload?.()
  }
}

function sentRequest(): FakeXhr {
  if (!FakeXhr.last) throw new Error('no request was sent')
  return FakeXhr.last
}

const video = new Blob(['fake video bytes'], { type: 'video/mp4' })

describe('uploadToR2', () => {
  beforeEach(() => {
    FakeXhr.last = null
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('PUTs the file with its Content-Type and reports progress up to 1', async () => {
    const progress: number[] = []
    const upload = uploadToR2('https://r2/x?sig=1', video, { onProgress: (f) => progress.push(f) })

    const xhr = sentRequest()
    expect(xhr.method).toBe('PUT')
    expect(xhr.url).toBe('https://r2/x?sig=1')
    expect(xhr.headers['Content-Type']).toBe('video/mp4')
    expect(xhr.body).toBe(video)

    xhr.progress(5, 10)
    xhr.respond(200)
    await upload
    expect(progress).toEqual([0.5, 1])
  })

  it('rejects with the HTTP status when R2 refuses (e.g. expired URL)', async () => {
    const upload = uploadToR2('https://r2/x', video)
    sentRequest().respond(403)

    await expect(upload).rejects.toBeInstanceOf(UploadError)
    await expect(upload).rejects.toMatchObject({ status: 403 })
  })

  it('rejects with status 0 on a network failure', async () => {
    const upload = uploadToR2('https://r2/x', video)
    sentRequest().onerror?.()

    await expect(upload).rejects.toMatchObject({
      status: 0,
      message: 'Falha de rede durante o envio.',
    })
  })

  it('can be cancelled with an AbortSignal', async () => {
    const controller = new AbortController()
    const upload = uploadToR2('https://r2/x', video, { signal: controller.signal })

    controller.abort()
    await expect(upload).rejects.toMatchObject({ status: 0, message: 'Envio cancelado.' })
  })

  it('does not start when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(uploadToR2('https://r2/x', video, { signal: controller.signal })).rejects.toThrow(
      'Envio cancelado.',
    )
    expect(FakeXhr.last).toBeNull()
  })
})
