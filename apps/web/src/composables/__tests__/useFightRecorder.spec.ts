import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { useFightRecorder } from '@/composables/useFightRecorder'

const CAMERA_A = { deviceId: 'a', kind: 'videoinput', label: 'Cam A' }
const CAMERA_B = { deviceId: 'b', kind: 'videoinput', label: 'Cam B' }

/** MediaRecorder stand-in: the test decides when pieces arrive and when the browser stops it */
class FakeRecorder {
  static instances: FakeRecorder[] = []
  static constructorError: Error | null = null
  static isTypeSupported = () => true

  state: 'inactive' | 'recording' = 'inactive'
  mimeType = 'video/webm'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onerror: (() => void) | null = null
  onstop: (() => void) | null = null

  constructor() {
    if (FakeRecorder.constructorError) throw FakeRecorder.constructorError
    FakeRecorder.instances.push(this)
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.browserStops()
  }
  emitPiece() {
    this.ondataavailable?.({ data: new Blob(['piece']) })
  }
  browserStops() {
    this.state = 'inactive'
    this.onstop?.()
  }
}

function fakeStream() {
  const track = { readyState: 'live', stop: vi.fn<() => void>() }
  return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
}

let openFails: Error | null
let mediaDevices: {
  getUserMedia: ReturnType<typeof vi.fn>
  enumerateDevices: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
  FakeRecorder.instances = []
  FakeRecorder.constructorError = null
  openFails = null
  mediaDevices = {
    // `{ video: true }` is the permission probe; the exact-device call opens the preview
    getUserMedia: vi.fn<(constraints: { video: unknown }) => Promise<MediaStream>>(
      async (constraints) => {
        const isPreview = typeof constraints.video === 'object'
        if (isPreview && openFails) throw openFails
        return fakeStream()
      },
    ),
    enumerateDevices: vi.fn<() => Promise<unknown[]>>(async () => [CAMERA_A, CAMERA_B]),
    addEventListener: vi.fn<(type: string, handler: () => Promise<void>) => void>(),
    removeEventListener: vi.fn<(type: string, handler: () => Promise<void>) => void>(),
  }
  Object.defineProperty(navigator, 'mediaDevices', { value: mediaDevices, configurable: true })
  vi.stubGlobal('MediaRecorder', FakeRecorder)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function mountRecorder() {
  let recorder!: ReturnType<typeof useFightRecorder>
  const wrapper = mount(
    defineComponent({
      setup() {
        recorder = useFightRecorder()
        return () => null
      },
    }),
  )
  return { recorder, wrapper }
}

/** Camera A open and previewing */
async function previewing() {
  const mounted = mountRecorder()
  await mounted.recorder.loadCameras()
  await flushPromises()
  expect(mounted.recorder.state.value).toBe('previewing')
  return mounted
}

function notReadable() {
  const error = new Error('busy')
  error.name = 'NotReadableError'
  return error
}

describe('useFightRecorder', () => {
  it('retry after a failed camera open reopens the preview', async () => {
    openFails = notReadable()
    const { recorder } = mountRecorder()
    await recorder.loadCameras()
    await flushPromises()
    expect(recorder.error.value).not.toBeNull()
    expect(recorder.stream.value).toBeNull()

    openFails = null
    await recorder.retry()
    await flushPromises()

    expect(recorder.stream.value).not.toBeNull()
    expect(recorder.state.value).toBe('previewing')
    expect(recorder.error.value).toBeNull()
  })

  it('changing the camera after stopping keeps state "stopped" and the recording', async () => {
    const { recorder } = await previewing()
    recorder.start()
    FakeRecorder.instances[0]!.emitPiece()
    const blob = await recorder.stop()
    expect(recorder.state.value).toBe('stopped')

    recorder.cameraId.value = 'b'
    await flushPromises()

    expect(recorder.state.value).toBe('stopped')
    expect(recorder.recording.value).toBe(blob)
  })

  it('a failed camera change after stopping keeps state "stopped" and the recording', async () => {
    const { recorder } = await previewing()
    recorder.start()
    FakeRecorder.instances[0]!.emitPiece()
    const blob = await recorder.stop()

    openFails = notReadable()
    recorder.cameraId.value = 'b'
    await flushPromises()

    expect(recorder.state.value).toBe('stopped')
    expect(recorder.recording.value).toBe(blob)
    expect(recorder.error.value).not.toBeNull()
  })

  it('devicechange during a recording does not probe the camera', async () => {
    const { recorder } = await previewing()
    recorder.start()
    const onDeviceChange = mediaDevices.addEventListener.mock.calls[0]![1] as () => Promise<void>
    const opened = mediaDevices.getUserMedia.mock.calls.length
    const listed = mediaDevices.enumerateDevices.mock.calls.length

    await onDeviceChange()

    expect(mediaDevices.getUserMedia.mock.calls.length).toBe(opened)
    expect(mediaDevices.enumerateDevices.mock.calls.length).toBe(listed + 1)
    expect(recorder.error.value).toBeNull()
    expect(recorder.state.value).toBe('recording')
  })

  it('devicechange with no camera open asks for permission again', async () => {
    mountRecorder()
    const onDeviceChange = mediaDevices.addEventListener.mock.calls[0]![1] as () => Promise<void>

    await onDeviceChange()

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: true })
  })

  it('a recorder error stops the timer and ends the recording with what it has', async () => {
    const { recorder } = await previewing()
    recorder.start()
    const fake = FakeRecorder.instances[0]!
    fake.emitPiece()

    fake.onerror?.()
    fake.browserStops()

    expect(recorder.state.value).toBe('stopped')
    expect(recorder.recording.value).toBeInstanceOf(Blob)
    expect(recorder.error.value).not.toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a recorder error before any piece goes back to previewing', async () => {
    const { recorder } = await previewing()
    recorder.start()
    const fake = FakeRecorder.instances[0]!

    fake.onerror?.()
    fake.browserStops()

    expect(recorder.state.value).toBe('previewing')
    expect(recorder.recording.value).toBeNull()
    expect(recorder.error.value).not.toBeNull()
  })

  it('start after an errored recording leaves exactly one timer, and leaving the screen clears it', async () => {
    const { recorder, wrapper } = await previewing()
    recorder.start()
    const first = FakeRecorder.instances[0]!
    first.emitPiece()
    first.onerror?.()
    first.browserStops()

    recorder.start()
    vi.advanceTimersByTime(1000)

    expect(vi.getTimerCount()).toBe(1)
    expect(recorder.elapsedSeconds.value).toBeGreaterThan(0.5)
    expect(recorder.elapsedSeconds.value).toBeLessThan(1.5)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('start survives MediaRecorder throwing', async () => {
    const { recorder } = await previewing()
    const notSupported = new Error('no')
    notSupported.name = 'NotSupportedError'
    FakeRecorder.constructorError = notSupported

    expect(() => recorder.start()).not.toThrow()

    expect(recorder.state.value).toBe('previewing')
    expect(recorder.error.value).toBeTruthy()
    expect(vi.getTimerCount()).toBe(0)
  })
})
