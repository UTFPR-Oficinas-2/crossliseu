import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { defineComponent } from 'vue'
import { useFightRecorder } from '../useFightRecorder'

// Fakes for the browser APIs: no camera, no real MediaRecorder
const cameraA = { deviceId: 'cam-a', kind: 'videoinput', label: 'Câmera A' }
const cameraB = { deviceId: 'cam-b', kind: 'videoinput', label: 'Câmera B' }

function fakeStream() {
  const track = { stop: vi.fn<() => void>(), readyState: 'live' }
  return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
}

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = []
  static isTypeSupported = () => true
  state: 'inactive' | 'recording' = 'inactive'
  mimeType = 'video/mp4;codecs=avc1'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() {
    FakeMediaRecorder.instances.push(this)
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.onstop?.()
  }
}

describe('useFightRecorder: camera list changes', () => {
  let mediaDevices: EventTarget & {
    getUserMedia: Mock<() => Promise<MediaStream>>
    enumerateDevices: Mock<() => Promise<unknown[]>>
  }

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

  beforeEach(() => {
    mediaDevices = Object.assign(new EventTarget(), {
      getUserMedia: vi.fn<() => Promise<MediaStream>>(async () => fakeStream()),
      enumerateDevices: vi.fn<() => Promise<unknown[]>>(async () => [cameraA]),
    })
    Object.defineProperty(navigator, 'mediaDevices', { value: mediaDevices, configurable: true })
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
    FakeMediaRecorder.instances = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function startRecording() {
    const { recorder, wrapper } = mountRecorder()
    await recorder.loadCameras()
    await flushPromises()
    recorder.start()
    expect(recorder.state.value).toBe('recording')
    return { recorder, wrapper }
  }

  it('does not probe the camera or clear the error when a device appears during a recording', async () => {
    const { recorder, wrapper } = await startRecording()
    // The browser reports a problem while the recording goes on
    FakeMediaRecorder.instances[0]!.onerror?.()
    const message = recorder.error.value
    expect(message).not.toBeNull()
    const openedBefore = mediaDevices.getUserMedia.mock.calls.length

    mediaDevices.dispatchEvent(new Event('devicechange'))
    await flushPromises()

    expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(openedBefore)
    expect(recorder.error.value).toBe(message)
    expect(recorder.state.value).toBe('recording')
    wrapper.unmount()
  })

  it('updates the camera list when a device is plugged in', async () => {
    const { recorder, wrapper } = mountRecorder()
    await recorder.loadCameras()
    await flushPromises()
    expect(recorder.cameras.value).toHaveLength(1)

    mediaDevices.enumerateDevices.mockResolvedValue([cameraA, cameraB])
    mediaDevices.dispatchEvent(new Event('devicechange'))
    await flushPromises()

    expect(recorder.cameras.value.map((camera) => camera.deviceId)).toEqual(['cam-a', 'cam-b'])
    expect(recorder.cameraId.value).toBe('cam-a') // the chosen camera is still there
    wrapper.unmount()
  })

  it('stops listening for device changes when the screen is left', async () => {
    const { recorder, wrapper } = mountRecorder()
    await recorder.loadCameras()
    await flushPromises()
    wrapper.unmount()
    const listedBefore = mediaDevices.enumerateDevices.mock.calls.length

    mediaDevices.dispatchEvent(new Event('devicechange'))
    await flushPromises()

    expect(mediaDevices.enumerateDevices).toHaveBeenCalledTimes(listedBefore)
  })
})
