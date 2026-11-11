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

  /** Reads the camera list and keeps the current choice when that camera is still there */
  async function listCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices()
    cameras.value = devices.filter((device) => device.kind === 'videoinput')

    const stillThere = cameras.value.some((camera) => camera.deviceId === cameraId.value)
    if (!stillThere) cameraId.value = cameras.value[0]?.deviceId ?? ''
  }

  /**
   * Lists the cameras. Asks for permission first: without it, browsers hide camera names. Also the
   * retry after a failed open: when the choice did not change, the watch below does not fire, so
   * the preview is reopened here.
   */
  async function loadCameras() {
    error.value = null
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true })
      probe.getTracks().forEach((track) => track.stop())

      const before = cameraId.value
      await listCameras()

      const canPreview = state.value === 'idle' || state.value === 'previewing'
      if (cameraId.value === before && !stream.value && cameraId.value && canPreview) {
        await openCamera(cameraId.value)
      }
    } catch (err) {
      error.value = describeCameraError(err)
    }
  }

  /**
   * Opens the chosen camera for the preview, closing the previous one. After a recording
   * ("stopped") the state stays as it is: the unsent file is still there to send or download.
   */
  async function openCamera(deviceId: string) {
    stopStream()
    if (!deviceId) return
    error.value = null
    try {
      stream.value = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, ...RECORDING_VIDEO_CONSTRAINTS },
        audio: false, // the analysis only needs images; no audio keeps the file smaller
      })
      if (state.value !== 'stopped') state.value = 'previewing'
    } catch (err) {
      error.value = describeCameraError(err)
      if (state.value !== 'stopped') state.value = 'idle'
    }
  }

  // Changing the camera reopens the preview; never in the middle of a recording
  watch(cameraId, (deviceId) => {
    if (state.value !== 'recording') void openCamera(deviceId)
  })

  let stopWaiters: ((blob: Blob | null) => void)[] = []

  /** The recorder ended (stop button, or the browser stopped it): build the file from the pieces */
  function finalize() {
    clearInterval(timer)
    recorder = null
    if (chunks.length > 0) {
      // Plain type ("video/mp4"): it is what the upload signs and what R2 stores
      recording.value = new Blob(chunks, { type: baseMimeType(mimeType.value || 'video/webm') })
      state.value = 'stopped'
    } else {
      // Nothing was recorded (e.g. the recorder failed at once): back to the live preview
      recording.value = null
      state.value = 'previewing'
    }
    chunks = []
    const waiters = stopWaiters
    stopWaiters = []
    waiters.forEach((resolve) => resolve(recording.value))
  }

  function start() {
    if (!stream.value || state.value === 'recording') return

    clearInterval(timer)
    chunks = []
    recording.value = null
    elapsedSeconds.value = 0
    error.value = null

    try {
      const preferred = pickMimeType((type) => MediaRecorder.isTypeSupported(type))
      recorder = new MediaRecorder(stream.value, {
        ...(preferred ? { mimeType: preferred } : {}),
        videoBitsPerSecond: RECORDING_BITS_PER_SECOND,
      })
      mimeType.value = recorder.mimeType || preferred || ''

      // A piece of the video arrives every RECORDING_CHUNK_MS; they are joined when it stops
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      // `onstop` fires after the last `ondataavailable`, so every piece is in `chunks` by then
      recorder.onstop = finalize
      recorder.onerror = () => {
        clearInterval(timer)
        error.value = 'A gravação foi interrompida por um erro do navegador.'
        // The browser stops the recorder after an error, which ends in `finalize`
      }

      recorder.start(RECORDING_CHUNK_MS)
    } catch {
      recorder = null
      error.value = 'Este navegador não conseguiu iniciar a gravação.'
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
    const current = recorder
    if (!current || current.state === 'inactive') return Promise.resolve(recording.value)

    return new Promise((resolve) => {
      stopWaiters.push(resolve)
      current.stop()
    })
  }

  function stopStream() {
    stream.value?.getTracks().forEach((track) => track.stop())
    stream.value = null
  }

  /** Frees the camera (its light turns off) and stops the timer when leaving the screen */
  function release() {
    clearInterval(timer)
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    recorder = null
    stopStream()
    navigator.mediaDevices?.removeEventListener('devicechange', onDeviceChange)
  }

  // A camera plugged in or out updates the list by itself. With a camera open, permission is
  // already granted, so only the list is read: probing the camera again mid-recording can fail
  // (some cameras cannot be opened twice) or disturb the capture.
  async function onDeviceChange() {
    if (!stream.value) return loadCameras()
    try {
      await listCameras()
    } catch (err) {
      error.value = describeCameraError(err)
    }
  }
  navigator.mediaDevices?.addEventListener('devicechange', onDeviceChange)
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
    start,
    stop,
  }
}
