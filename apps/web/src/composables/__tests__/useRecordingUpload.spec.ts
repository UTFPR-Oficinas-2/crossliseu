import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { UploadError, uploadToR2 } from '@/api/r2-upload'
import { markUploaded, requestUploadUrl } from '@/api/recordings'
import { describeUploadError, useRecordingUpload } from '../useRecordingUpload'

// The three steps are replaced by fakes: no API, no R2, no network
vi.mock('@/api/recordings', () => ({
  requestUploadUrl: vi.fn<typeof import('@/api/recordings').requestUploadUrl>(),
  markUploaded: vi.fn<typeof import('@/api/recordings').markUploaded>(),
}))
vi.mock('@/api/r2-upload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/r2-upload')>()),
  uploadToR2: vi.fn<typeof import('@/api/r2-upload').uploadToR2>(),
}))

const video = new Blob(['fake video bytes'], { type: 'video/mp4' })
const presigned = { url: 'https://r2/x?sig=1', key: 'recordings/m1.mp4', expiresAt: '2026-01-01' }

describe('useRecordingUpload', () => {
  afterEach(() => vi.resetAllMocks())

  it('runs the three steps in order and ends in done', async () => {
    vi.mocked(requestUploadUrl).mockResolvedValue(presigned)
    vi.mocked(uploadToR2).mockImplementation(async (_url, _file, options) => {
      options?.onProgress?.(0.5)
      options?.onProgress?.(1)
    })
    vi.mocked(markUploaded).mockResolvedValue(undefined)

    const { state, progress, error, upload } = useRecordingUpload()
    expect(await upload('m1', video, 't')).toBe(true)

    expect(requestUploadUrl).toHaveBeenCalledWith('m1', 'video/mp4', video.size, 't')
    expect(vi.mocked(uploadToR2).mock.calls[0]?.[0]).toBe(presigned.url)
    expect(vi.mocked(uploadToR2).mock.calls[0]?.[1]).toBe(video)
    expect(markUploaded).toHaveBeenCalledWith('m1', { key: presigned.key, size: video.size }, 't')
    expect(state.value).toBe('done')
    expect(progress.value).toBe(1)
    expect(error.value).toBeNull()
  })

  it('stops at the failing step and explains it', async () => {
    vi.mocked(requestUploadUrl).mockResolvedValue(presigned)
    vi.mocked(uploadToR2).mockRejectedValue(new UploadError(403, 'refused'))

    const { state, error, upload } = useRecordingUpload()
    expect(await upload('m1', video, 't')).toBe(false)

    expect(markUploaded).not.toHaveBeenCalled()
    expect(state.value).toBe('error')
    expect(error.value).toMatch(/expirou/)
  })

  it('asks for a new URL on every retry', async () => {
    vi.mocked(requestUploadUrl).mockResolvedValue(presigned)
    vi.mocked(uploadToR2)
      .mockRejectedValueOnce(new UploadError(0, 'network'))
      .mockResolvedValueOnce(undefined)
    vi.mocked(markUploaded).mockResolvedValue(undefined)

    const { state, upload } = useRecordingUpload()
    await upload('m1', video, 't')
    expect(state.value).toBe('error')

    await upload('m1', video, 't')
    expect(requestUploadUrl).toHaveBeenCalledTimes(2)
    expect(state.value).toBe('done')
  })

  it('reset goes back to idle', async () => {
    vi.mocked(requestUploadUrl).mockRejectedValue(new ApiError(0, 'offline'))

    const { state, error, upload, reset } = useRecordingUpload()
    await upload('m1', video, 't')
    expect(state.value).toBe('error')

    reset()
    expect(state.value).toBe('idle')
    expect(error.value).toBeNull()
  })
})

describe('describeUploadError', () => {
  it('explains R2 failures', () => {
    expect(describeUploadError(new UploadError(403, 'x'))).toMatch(/expirou/)
    expect(describeUploadError(new UploadError(0, 'x'))).toMatch(/conexão caiu/)
    expect(describeUploadError(new UploadError(0, 'Envio cancelado.'))).toBe('Envio cancelado.')
    expect(describeUploadError(new UploadError(500, 'x'))).toMatch(/HTTP 500/)
  })

  it('explains API failures', () => {
    expect(describeUploadError(new ApiError(0, 'x'))).toMatch(/Sem conexão/)
    expect(describeUploadError(new ApiError(401, 'x'))).toMatch(/sessão expirou/)
    expect(describeUploadError(new ApiError(404, 'x'))).toMatch(/não foi encontrada/)
    expect(describeUploadError(new ApiError(500, 'x'))).toMatch(/HTTP 500/)
  })

  it('falls back to a generic message', () => {
    expect(describeUploadError(new Error('?'))).toBe('Não foi possível enviar o vídeo.')
  })
})
