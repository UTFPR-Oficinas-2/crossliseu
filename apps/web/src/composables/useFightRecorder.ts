import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import {
  baseMimeType,
  describeCameraError,
  pickMimeType,
  RECORDING_BITS_PER_SECOND,
  RECORDING_CHUNK_MS,
  RECORDING_VIDEO_CONSTRAINTS,
} from '@/utils/recording'

/**
 * idle       -> no camera open yet
 * previewing -> camera open, live preview, ready to record
 * recording  -> MediaRecorder running
 * stopped    -> recording finished; the file is in `recording`
 */
export type RecorderState = 'idle' | 'previewing' | 'recording' | 'stopped'

/**
 * Fight recording on the operator's machine: pick the arena camera, preview it, record it with
 * MediaRecorder and hand back the file (a Blob). No UI here, and no upload: the screen shows
 * this state, and the upload (part 4) will take `recording` and send it to R2.
 */
export function useFightRecorder() {
  /** Cameras connected to this machine */
  const cameras = ref<MediaDeviceInfo[]>([])
  /** deviceId of the chosen camera */
  const cameraId = ref('')
  /** Live camera feed; the screen plugs it into a <video> for the preview */
  const stream = shallowRef<MediaStream | null>(null)
  const state = ref<RecorderState>('idle')
  /** Message for the operator, or null */
  const error = ref<string | null>(null)
  const elapsedSeconds = ref(0)
  /** The finished video file, once stopped */
  const recording = shallowRef<Blob | null>(null)
  /** Format actually used, e.g. "video/mp4;codecs=avc1" */
  const mimeType = ref('')

  let recorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let timer: ReturnType<typeof setInterval> | undefined
  /** Callers of `stop()` waiting for the file */
  let stopWaiters: ((blob: Blob | null) => void)[] = []
  /** Stops the current recorder and marks the stop as asked for (set by `start`) */
  let stopRecorder: (() => void) | null = null
  /** Bumped by every `openCamera` and by `release`, so a late getUserMedia knows it is stale */
  let openRequest = 0

  /** Lists the cameras. Asks for permission first: without it, browsers hide camera names. */
  async function loadCameras() {
    error.value = null
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true })
      probe.getTracks().forEach((track) => track.stop())
      await listCameras()
    } catch (err) {
      error.value = describeCameraError(err)
    }
  }

  /** Reads the connected cameras into `cameras`, keeping the chosen one if it is still there */
  async function listCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices()
    cameras.value = devices.filter((device) => device.kind === 'videoinput')

    // Keep the current choice if that camera is still there, otherwise take the first one
    const stillThere = cameras.value.some((camera) => camera.deviceId === cameraId.value)
    if (!stillThere) cameraId.value = cameras.value[0]?.deviceId ?? ''
  }

  /**
   * A camera was plugged in or out. Only the list is refreshed: no probe capture (it would open a
   * second stream on a camera that may be recording) and no change to `error`. The permission was
   * already granted by `loadCameras`, so the names are available.
   */
  async function refreshCameras() {
    try {
      await listCameras()
    } catch {
      // The list stays as it was; the next plug event or "Tentar de novo" tries again
    }
  }

  /**
   * Opens the chosen camera for the preview, closing the previous one. A finished recording
   * stays `stopped` (it is still unsent); only the preview behind it changes.
   */
  async function openCamera(deviceId: string) {
    const request = ++openRequest
    stopStream()
    if (!deviceId) return
    error.value = null
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, ...RECORDING_VIDEO_CONSTRAINTS },
        audio: false, // the analysis only needs images; no audio keeps the file smaller
      })
      // A newer call (or leaving the screen) replaced this one: free the camera at once
      if (request !== openRequest) {
        next.getTracks().forEach((track) => track.stop())
        return
      }
      stream.value = next
      if (state.value !== 'stopped') state.value = 'previewing'
    } catch (err) {
      if (request !== openRequest) return
      error.value = describeCameraError(err)
      if (state.value !== 'stopped') state.value = 'idle'
    }
  }

  // Changing the camera reopens the preview; never in the middle of a recording
  watch(cameraId, (deviceId) => {
    if (state.value !== 'recording') void openCamera(deviceId)
  })

  /** "Tentar de novo" after a camera error: list the cameras again and reopen the chosen one */
  async function retry() {
    await loadCameras()
    if (!error.value && state.value !== 'recording') await openCamera(cameraId.value)
  }

  /** Joins the pieces into the file. Runs on every stop: asked for, or by the browser itself. */
  function finish(current: MediaRecorder, requested: boolean) {
    if (recorder !== current) return // released while stopping
    clearInterval(timer)
    // Plain type ("video/mp4"): it is what the upload signs and what R2 stores
    const blob = new Blob(chunks, { type: baseMimeType(mimeType.value || 'video/webm') })
    chunks = []
    recording.value = blob
    state.value = 'stopped'
    if (!requested && !error.value) {
      error.value =
        'A gravação parou sozinha (a câmera foi desconectada?). O que foi gravado até aqui está abaixo.'
    }
    stopWaiters.forEach((resolve) => resolve(blob))
    stopWaiters = []

    // The camera was unplugged: its tracks are dead, so reopen the preview for the next recording
    const tracks = stream.value?.getVideoTracks() ?? []
    if (tracks.length > 0 && tracks.every((track) => track.readyState === 'ended')) {
      void openCamera(cameraId.value)
    }
  }

  function start() {
    if (!stream.value || state.value === 'recording') return

    const preferred = pickMimeType((type) => MediaRecorder.isTypeSupported(type))
    let next: MediaRecorder
    try {
      next = new MediaRecorder(stream.value, {
        ...(preferred ? { mimeType: preferred } : {}),
        videoBitsPerSecond: RECORDING_BITS_PER_SECOND,
      })
    } catch {
      error.value = 'Não foi possível começar a gravação. Troque de câmera ou recarregue a página.'
      return
    }

    error.value = null
    chunks = []
    recording.value = null
    elapsedSeconds.value = 0
    stopWaiters = []
    recorder = next
    mimeType.value = next.mimeType || preferred || ''

    let requested = false
    // A piece of the video arrives every RECORDING_CHUNK_MS; they are joined when it stops
    next.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    next.onerror = () => {
      error.value = 'A gravação foi interrompida por um erro do navegador.'
    }
    // `onstop` fires after the last `ondataavailable`, so every piece is in `chunks` by then.
    // It also fires when the browser stops by itself (error, camera unplugged).
    next.onstop = () => finish(next, requested)
    stopRecorder = () => {
      requested = true
      if (next.state !== 'inactive') next.stop()
    }

    try {
      next.start(RECORDING_CHUNK_MS)
    } catch {
      recorder = null
      stopRecorder = null
      error.value = 'Não foi possível começar a gravação. Troque de câmera ou recarregue a página.'
      return
    }
    state.value = 'recording'

    const startedAt = performance.now()
    timer = setInterval(() => {
      elapsedSeconds.value = (performance.now() - startedAt) / 1000
    }, 250)
  }

  /** Stops recording. Resolves with the video file once the last piece has arrived. */
  function stop(): Promise<Blob | null> {
    if (state.value !== 'recording') return Promise.resolve(recording.value)
    return new Promise((resolve) => {
      stopWaiters.push(resolve)
      stopRecorder?.()
    })
  }

  function stopStream() {
    stream.value?.getTracks().forEach((track) => track.stop())
    stream.value = null
  }

  /** Frees the camera (its light turns off) and stops the timer when leaving the screen */
  function release() {
    openRequest++ // a getUserMedia still pending frees its camera when it resolves
    clearInterval(timer)
    const current = recorder
    recorder = null
    stopRecorder = null
    if (current && current.state !== 'inactive') current.stop()
    stopStream()
    navigator.mediaDevices?.removeEventListener('devicechange', refreshCameras)
  }

  // A camera plugged in or out updates the list by itself
  navigator.mediaDevices?.addEventListener('devicechange', refreshCameras)
  onBeforeUnmount(release)

  return {
    cameras,
    cameraId,
    stream,
    state,
    error,
    elapsedSeconds,
    recording,
    mimeType,
    loadCameras,
    retry,
    start,
    stop,
  }
}
