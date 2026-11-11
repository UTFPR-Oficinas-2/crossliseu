import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, shallowRef } from 'vue'
import type { RecorderState } from '@/composables/useFightRecorder'
import FightRecorderPanel from '../components/FightRecorderPanel.vue'

// The recorder and the upload are tested on their own; here they are replaced by simple fakes so
// the panel's reaction to the fight phase is what is under test.
const recorder = {
  cameras: ref<MediaDeviceInfo[]>([]),
  cameraId: ref(''),
  stream: shallowRef<MediaStream | null>(null),
  state: ref<RecorderState>('idle'),
  error: ref<string | null>(null),
  elapsedSeconds: ref(0),
  recording: shallowRef<Blob | null>(null),
  mimeType: ref(''),
  loadCameras: vi.fn<() => unknown>(),
  retry: vi.fn<() => unknown>(),
  start: vi.fn<() => unknown>(),
  stop: vi.fn<() => unknown>(),
}

vi.mock('@/composables/useFightRecorder', () => ({ useFightRecorder: () => recorder }))
vi.mock('@/composables/useRecordingUpload', () => ({
  useRecordingUpload: () => ({
    state: ref('idle'),
    progress: ref(0),
    error: ref(null),
    upload: vi.fn<() => unknown>(),
    reset: vi.fn<() => unknown>(),
  }),
}))
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn<() => unknown>(),
  onBeforeRouteUpdate: vi.fn<() => unknown>(),
}))

function mountPanel(fightPhase: 'before' | 'running' | 'ended' = 'before') {
  return mount(FightRecorderPanel, { props: { matchId: 'm1', fightPhase } })
}

function withCamera() {
  recorder.stream.value = { getVideoTracks: () => [] } as unknown as MediaStream
  recorder.state.value = 'previewing'
}

beforeEach(() => {
  setActivePinia(createPinia())
  // The test DOM can't turn a Blob into an object URL
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }),
  )
  recorder.stream.value = null
  recorder.state.value = 'idle'
  recorder.error.value = null
  recorder.recording.value = null
  recorder.start.mockReset()
  recorder.stop.mockReset().mockResolvedValue(null)
})

describe('FightRecorderPanel', () => {
  it('has no manual record button and no result before the fight', () => {
    withCamera()
    const wrapper = mountPanel('before')

    expect(wrapper.text()).not.toContain('Gravar')
    expect(wrapper.text()).not.toContain('Parar')
    expect(wrapper.text()).not.toContain('Baixar')
    expect(recorder.start).not.toHaveBeenCalled()
  })

  it('starts recording by itself when the fight starts', async () => {
    withCamera()
    const wrapper = mountPanel('before')

    await wrapper.setProps({ fightPhase: 'running' })

    expect(recorder.start).toHaveBeenCalledTimes(1)
  })

  it('stops recording by itself when the fight ends', async () => {
    withCamera()
    const wrapper = mountPanel('running')
    recorder.state.value = 'recording'

    await wrapper.setProps({ fightPhase: 'ended' })

    expect(recorder.stop).toHaveBeenCalledTimes(1)
  })

  it('lets the fight start and end without a camera, with no error', async () => {
    const wrapper = mountPanel('before') // no stream: camera missing, denied or failed

    await wrapper.setProps({ fightPhase: 'running' })
    await wrapper.setProps({ fightPhase: 'ended' })
    await flushPromises()

    expect(recorder.start).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('não foi gravada')
  })

  it('shows the file, Enviar and an optional Baixar only after the fight', async () => {
    const wrapper = mountPanel('ended')
    recorder.recording.value = new Blob(['x'], { type: 'video/mp4' })
    recorder.state.value = 'stopped'
    await flushPromises()

    expect(wrapper.text()).toContain('Enviar')
    expect(wrapper.text()).toContain('Baixar')
  })

  it('hides the result while the fight is still running', async () => {
    const wrapper = mountPanel('running')
    recorder.recording.value = new Blob(['x'], { type: 'video/mp4' })
    recorder.state.value = 'stopped' // e.g. the camera was unplugged mid-fight
    await flushPromises()

    expect(wrapper.text()).not.toContain('Enviar')
  })
})
