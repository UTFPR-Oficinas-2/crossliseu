import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { UploadError, uploadToR2 } from '@/api/r2-upload'
import { confirmRecordingUpload, requestRecordingUpload } from '@/data'
import { describeUploadError, useRecordingUpload } from '../useRecordingUpload'

// The three steps are replaced by fakes: no API, no R2, no network
vi.mock('@/data', () => ({
  requestRecordingUpload: vi.fn<typeof import('@/data').requestRecordingUpload>(),
  confirmRecordingUpload: vi.fn<typeof import('@/data').confirmRecordingUpload>(),
}))
vi.mock('@/api/r2-upload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/r2-upload')>()),
  uploadToR2: vi.fn<typeof import('@/api/r2-upload').uploadToR2>(),
}))

const video = new Blob(['fake video bytes'], { type: 'video/mp4' })
const presigned = { url: 'https://r2/x?sig=1', key: 'recordings/m1.mp4' }

describe('useRecordingUpload', () => {
  afterEach(() => vi.resetAllMocks())

  it('runs the three steps in order and ends in done', async () => {
    vi.mocked(requestRecordingUpload).mockResolvedValue(presigned)
    vi.mocked(uploadToR2).mockImplementation(async (_url, _file, options) => {
      options?.onProgress?.(0.5)
      options?.onProgress?.(1)
    })
    vi.mocked(confirmRecordingUpload).mockResolvedValue(undefined)

    const { state, progress, error, upload } = useRecordingUpload()
    expect(await upload('m1', video, 't')).toBe(true)

    expect(requestRecordingUpload).toHaveBeenCalledWith('m1', 'video/mp4', 't')
    expect(vi.mocked(uploadToR2).mock.calls[0]?.[0]).toBe(presigned.url)
    expect(vi.mocked(uploadToR2).mock.calls[0]?.[1]).toBe(video)
    expect(confirmRecordingUpload).toHaveBeenCalledWith(
      'm1',
      { key: presigned.key, size: video.size },
      't',
    )
    expect(state.value).toBe('done')
    expect(progress.value).toBe(1)
    expect(error.value).toBeNull()
  })

  it('stops at the failing step and explains it', async () => {
    vi.mocked(requestRecordingUpload).mockResolvedValue(presigned)
    vi.mocked(uploadToR2).mockRejectedValue(new UploadError(403, 'refused'))

    const { state, error, upload } = useRecordingUpload()
    expect(await upload('m1', video, 't')).toBe(false)

    expect(confirmRecordingUpload).not.toHaveBeenCalled()
    expect(state.value).toBe('error')
    expect(error.value).toMatch(/expirou/)
  })

  it('asks for a new URL on every retry', async () => {
    vi.mocked(requestRecordingUpload).mockResolvedValue(presigned)
    vi.mocked(uploadToR2)
      .mockRejectedValueOnce(new UploadError(0, 'network'))
      .mockResolvedValueOnce(undefined)
    vi.mocked(confirmRecordingUpload).mockResolvedValue(undefined)

    const { state, upload } = useRecordingUpload()
    await upload('m1', video, 't')
    expect(state.value).toBe('error')

    await upload('m1', video, 't')
    expect(requestRecordingUpload).toHaveBeenCalledTimes(2)
    expect(state.value).toBe('done')
  })

  it('reset goes back to idle', async () => {
    vi.mocked(requestRecordingUpload).mockRejectedValue(new ApiError(0, 'offline'))

    const { state, error, upload, reset } = useRecordingUpload()
    await upload('m1', video, 't')
    expect(state.value).toBe('error')

    reset()
    expect(state.value).toBe('idle')
    expect(error.value).toBeNull()
  })
})

describe('useRecordingUpload cancel and reset', () => {
  afterEach(() => vi.resetAllMocks())

  it('a reset during step 1 stays idle and skips the other steps', async () => {
    let answer!: (value: typeof presigned) => void
    vi.mocked(requestRecordingUpload).mockReturnValue(new Promise((resolve) => (answer = resolve)))

    const { state, error, upload, reset } = useRecordingUpload()
    const sending = upload('m1', video, 't')
    reset()
    answer(presigned)

    expect(await sending).toBe(false)
    expect(uploadToR2).not.toHaveBeenCalled()
    expect(state.value).toBe('idle')
    expect(error.value).toBeNull()
  })

  it('a cancel during step 1 ends in error without uploading', async () => {
    let answer!: (value: typeof presigned) => void
    vi.mocked(requestRecordingUpload).mockReturnValue(new Promise((resolve) => (answer = resolve)))

    const { state, error, upload, cancel } = useRecordingUpload()
    const sending = upload('m1', video, 't')
    cancel()
    answer(presigned)

    expect(await sending).toBe(false)
    expect(uploadToR2).not.toHaveBeenCalled()
    expect(state.value).toBe('error')
    expect(error.value).toBe('Envio cancelado.')
  })

  it('a reset during step 3 stays idle', async () => {
    vi.mocked(requestRecordingUpload).mockResolvedValue(presigned)
    vi.mocked(uploadToR2).mockResolvedValue(undefined)
    let confirm!: () => void
    vi.mocked(confirmRecordingUpload).mockReturnValue(new Promise((resolve) => (confirm = resolve)))

    const { state, upload, reset } = useRecordingUpload()
    const sending = upload('m1', video, 't')
    await vi.waitFor(() => expect(state.value).toBe('completing'))
    reset()
    confirm()

    expect(await sending).toBe(false)
    expect(state.value).toBe('idle')
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
    expect(describeUploadError(new ApiError(501, 'not_implemented'))).toMatch(/ainda não recebe/)
    expect(describeUploadError(new ApiError(500, 'x'))).toMatch(/HTTP 500/)
  })

  it('falls back to a generic message', () => {
    expect(describeUploadError(new Error('?'))).toBe('Não foi possível enviar o vídeo.')
  })
})
