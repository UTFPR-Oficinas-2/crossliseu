import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'
import { ApiError } from '@/api/client'
import { UploadError, uploadToR2 } from '@/api/r2-upload'
import { confirmRecordingUpload, requestRecordingUpload } from '@/data'

/**
 * idle       -> nothing sent yet
 * requesting -> step 1: asking the API for a presigned URL
 * uploading  -> step 2: bytes going straight to R2 (see `progress`)
 * completing -> step 3: telling the API the file is there
 * done       -> the video is in R2 and the API knows it
 * error      -> one step failed; `error` says why, and `upload` can run again
 */
export type UploadState = 'idle' | 'requesting' | 'uploading' | 'completing' | 'done' | 'error'

const CANCELLED = 'Envio cancelado.'

/** Operator-facing message for a failure in any of the three steps */
export function describeUploadError(error: unknown): string {
  if (error instanceof UploadError) {
    if (error.status === 403) return 'O link de envio expirou ou foi recusado. Tente de novo.'
    if (error.message === CANCELLED) return error.message
    if (error.status === 0)
      return 'A conexão caiu durante o envio. Confira a internet e tente de novo.'
    return `O armazenamento recusou o vídeo (HTTP ${error.status}). Tente de novo.`
  }
  if (error instanceof ApiError) {
    if (error.status === 0) return 'Sem conexão com o servidor. Confira a internet e tente de novo.'
    if (error.status === 401) return 'Sua sessão expirou. Entre de novo e reenvie o vídeo.'
    if (error.status === 404) return 'Esta luta não foi encontrada no servidor.'
    if (error.status === 501)
      return 'O servidor ainda não recebe vídeos. Baixe o arquivo para não perder a gravação.'
    return `O servidor recusou o envio (HTTP ${error.status}).`
  }
  return 'Não foi possível enviar o vídeo.'
}

/**
 * Sends a recorded fight to R2 in three steps: presigned URL from the API, PUT straight to R2,
 * then confirm to the API. Every attempt asks for a new URL, so a retry also fixes an expired one.
 */
export function useRecordingUpload() {
  const state = ref<UploadState>('idle')
  /** 0..1 while uploading */
  const progress = ref(0)
  const error = ref<string | null>(null)

  let controller: AbortController | null = null

  async function upload(matchId: string, file: Blob, token: string): Promise<boolean> {
    controller?.abort()
    const current = new AbortController()
    controller = current

    // The API steps can't be aborted mid-request, so a cancel is checked after each one
    const throwIfCancelled = () => {
      if (current.signal.aborted) throw new UploadError(0, CANCELLED)
    }

    error.value = null
    progress.value = 0
    try {
      state.value = 'requesting'
      const { url, key } = await requestRecordingUpload(matchId, file.type, file.size, token)
      throwIfCancelled()

      state.value = 'uploading'
      await uploadToR2(url, file, {
        signal: current.signal,
        onProgress: (fraction) => (progress.value = fraction),
      })
      throwIfCancelled()

      state.value = 'completing'
      await confirmRecordingUpload(matchId, { key, size: file.size }, token)
      // A reset meanwhile owns the state now. A plain cancel this late changes nothing: the
      // video is already in R2 and the API knows it.
      if (controller !== current) return false

      state.value = 'done'
      return true
    } catch (err) {
      // A newer attempt or a reset replaced this one: leave the state to it
      if (controller !== current) return false
      error.value = describeUploadError(err)
      state.value = 'error'
      return false
    } finally {
      if (controller === current) controller = null
    }
  }

  function cancel() {
    controller?.abort()
  }

  /** Back to idle, e.g. when a new recording replaces the one that was sent */
  function reset() {
    cancel()
    // Detach the cancelled attempt, so its catch block doesn't overwrite the idle state
    controller = null
    state.value = 'idle'
    progress.value = 0
    error.value = null
  }

  // Leaving the screen stops an upload in progress
  if (getCurrentInstance()) onBeforeUnmount(cancel)

  return { state, progress, error, upload, cancel, reset }
}
