// Fight recording helpers for the operator screen. Pure functions only: the camera and
// MediaRecorder live in `useFightRecorder`, so everything here runs in Vitest.

/**
 * Formats to try, best first. MP4 first because the cv-worker reads it today; Chrome records MP4
 * only in recent versions, so WebM stays as the fallback.
 */
export const RECORDING_MIME_TYPES = [
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const

/** 1280x720 at 30 fps: the size the cv-worker pipeline works with */
export const RECORDING_VIDEO_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
} as const

/** ~4 Mbit/s: a 3-minute fight is about 90 MB */
export const RECORDING_BITS_PER_SECOND = 4_000_000

/** MediaRecorder hands over one piece (chunk) of the video every second */
export const RECORDING_CHUNK_MS = 1000

/**
 * First format the browser can record, or `null` when none works (the recorder then uses the
 * browser default). `isSupported` is `MediaRecorder.isTypeSupported`, passed in so tests can fake it.
 */
export function pickMimeType(isSupported: (mimeType: string) => boolean): string | null {
  return RECORDING_MIME_TYPES.find((mimeType) => isSupported(mimeType)) ?? null
}

/** "mp4" or "webm", from a type like "video/webm;codecs=vp9" */
export function fileExtension(mimeType: string): 'mp4' | 'webm' {
  return mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
}

/** "<matchId>.mp4": the same name the file gets in R2 (`recordings/<matchId>.mp4`) */
export function recordingFileName(matchId: string, mimeType: string): string {
  return `${matchId}.${fileExtension(mimeType)}`
}

/** 125 -> "02:05"; an hour or more -> "1:02:05". Fractions are dropped. */
export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  const mmss = `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  return hours > 0 ? `${hours}:${mmss}` : mmss
}

/**
 * Operator-facing message for a camera error. `getUserMedia` rejects with a DOMException whose
 * `name` says what went wrong; anything unknown gets a generic message.
 */
export function describeCameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
      return 'Permissão da câmera negada. Libere o acesso no cadeado ao lado do endereço e tente de novo.'
    case 'NotFoundError':
      return 'Nenhuma câmera encontrada. Conecte a câmera da arena e tente de novo.'
    case 'NotReadableError':
      return 'A câmera está em uso por outro programa. Feche-o e tente de novo.'
    case 'OverconstrainedError':
      return 'Esta câmera não aceita as configurações de gravação. Escolha outra câmera.'
    default:
      return 'Não foi possível abrir a câmera.'
  }
}

/** 1536 -> "1,5 KB", 73400320 -> "70,0 MB" (one decimal, Brazilian comma) */
export function formatBytes(bytes: number): string {
  const megabytes = bytes / 1024 / 1024
  if (megabytes >= 1) return `${megabytes.toFixed(1).replace('.', ',')} MB`
  return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`
}
