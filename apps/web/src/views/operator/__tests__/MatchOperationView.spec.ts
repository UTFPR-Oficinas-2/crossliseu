import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import { openFightChannel, type FightChannelOptions } from '@/api/fight-channel'
import {
  freeRefereeSeat,
  getFightState,
  getRefereeSeats,
  getRefereeToken,
  sendFightCommand,
  type OperatorFightState,
} from '@/data'
import { liveToken } from '@/stores/__tests__/token-helpers'
import { TOKEN_STORAGE_KEY } from '@/stores/auth'
import FightRecorderPanel from '../components/FightRecorderPanel.vue'
import MatchOperationView from '../MatchOperationView.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept
    reject = refuse
  })
  return { promise, resolve, reject }
}

vi.mock('@/data', () => ({
  getFightState: vi.fn<typeof getFightState>(),
  getRefereeToken: vi.fn<typeof getRefereeToken>(() =>
    Promise.resolve({ token: 'abcdefghijklmnopqrstuv' }),
  ),
  getRefereeSeats: vi.fn<typeof getRefereeSeats>(() => Promise.resolve([])),
  freeRefereeSeat: vi.fn<typeof freeRefereeSeat>(),
  sendFightCommand: vi.fn<typeof sendFightCommand>(),
}))
vi.mock('@/api/fight-channel', () => ({
  openFightChannel: vi.fn<typeof openFightChannel>(),
}))

const video = shallowRef<Blob | null>(null)
const cameraError = ref<string | null>(null)
vi.mock('@/composables/useFightRecorder', () => ({
  useFightRecorder: () => ({
    cameras: ref([]),
    cameraId: ref(''),
    stream: ref(null),
    state: ref('stopped'),
    error: cameraError,
    elapsedSeconds: ref(20),
    recording: video,
    mimeType: ref('video/webm'),
    loadCameras: vi.fn<() => void>(),
    retry: vi.fn<() => void>(),
    start: vi.fn<() => void>(),
    stop: vi.fn<() => Promise<Blob | null>>(),
  }),
}))
vi.mock('@/composables/useRecordingUpload', () => ({
  useRecordingUpload: () => ({
    state: ref('idle'),
    progress: ref(0),
    error: ref(null),
    upload: vi.fn<() => Promise<boolean>>(),
    reset: vi.fn<() => void>(),
  }),
}))

const scheduled: OperatorFightState = {
  matchId: 'm1',
  status: 'scheduled',
  remainingMs: 180_000,
  endReason: null,
  robots: { A: { name: 'Tritura' }, B: { name: 'Ferrugem' } },
  score: { A: 0, B: 0 },
  closed: false,
  winnerSide: null,
  hasSelectedArena: true,
}
const finished: OperatorFightState = {
  ...scheduled,
  status: 'finished',
  remainingMs: 74_001,
  endReason: 'manual',
}
const closed: OperatorFightState = { ...finished, closed: true, hasSelectedArena: false }

async function mountFight() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/operator', name: 'operator', component: { template: '<p>Escolher luta</p>' } },
      {
        path: '/operator/:matchId',
        name: 'match-operation',
        component: MatchOperationView,
        props: true,
      },
    ],
  })
  await router.push('/operator/m1')
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
  await flushPromises()

  const button = (label: string) => wrapper.findAll('button').find((b) => b.text() === label)
  const link = (label: string) => wrapper.findAll('a').find((a) => a.text() === label)
  async function click(label: string) {
    const control = button(label)
    expect(control, `Button ${label}`).toBeDefined()
    await control!.trigger('click')
    await flushPromises()
  }
  return { wrapper, router, button, link, click }
}

describe('MatchOperationView', () => {
  enableAutoUnmount(afterEach)
  const get = vi.mocked(getFightState)
  const post = vi.mocked(sendFightCommand)
  const open = vi.mocked(openFightChannel)
  let channel: FightChannelOptions | undefined
  /** The snapshot the channel delivers once connected, or `null` for none */
  let firstFrame: OperatorFightState | null

  async function push(frame: OperatorFightState) {
    channel!.onState(frame)
    await flushPromises()
  }
  const fightLabels = ['Iniciar luta', 'Pausar', 'Retomar', 'Encerrar luta', 'Fechar luta']

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.setItem(TOKEN_STORAGE_KEY, liveToken())
    video.value = null
    cameraError.value = null
    get.mockReset().mockResolvedValue(scheduled)
    post.mockReset()
    channel = undefined
    firstFrame = scheduled
    open.mockReset().mockImplementation((options) => {
      channel = options
      const frame = firstFrame
      if (frame) {
        queueMicrotask(() => {
          options.onState(frame)
          options.onStatus('open')
        })
      }
      return { close: vi.fn<() => void>() }
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = () => 'blob:fight'
        static revokeObjectURL = () => {}
      },
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  })

  it('shows the referee link of the match', async () => {
    const { wrapper } = await mountFight()

    expect(vi.mocked(getRefereeToken)).toHaveBeenCalledWith('m1', expect.any(String))
    expect(wrapper.text()).toContain('Link dos árbitros')
    expect(wrapper.text()).toContain('/referee/abcdefghijklmnopqrstuv')
  })

  it('follows the fight over the channel with the operator JWT', async () => {
    const { button } = await mountFight()
    expect(open).toHaveBeenCalledOnce()
    expect(channel).toMatchObject({ matchId: 'm1', token: localStorage.getItem(TOKEN_STORAGE_KEY) })
    expect(get).not.toHaveBeenCalled()

    await push({ ...scheduled, status: 'ongoing' })
    expect(button('Pausar')).toBeDefined()
  })

  it('shows loading then the not-found screen', async () => {
    firstFrame = null
    const { wrapper } = await mountFight()
    expect(wrapper.text()).toContain('Carregando a luta')
    channel!.onStatus('not-found')
    await flushPromises()
    expect(wrapper.text()).toContain('Luta não encontrada')
  })

  it('hides the fight card but keeps the recorder when the match disappears mid-fight', async () => {
    const { wrapper, button } = await mountFight()
    expect(button('Iniciar luta')).toBeDefined()
    channel!.onStatus('not-found')
    await flushPromises()
    expect(wrapper.text()).toContain('Luta não encontrada')
    expect(wrapper.find('.fight-operation').exists()).toBe(false)
    expect(button('Iniciar luta')).toBeUndefined()
    expect(wrapper.findComponent(FightRecorderPanel).exists()).toBe(true)
  })

  it('retries an initial error and shows server names, side labels and the timer', async () => {
    firstFrame = null
    const { wrapper, click } = await mountFight()
    channel!.onStatus('reconnecting')
    await flushPromises()
    await click('Tentar atualizar')

    expect(wrapper.text()).toContain('Lado A')
    expect(wrapper.text()).toContain('Tritura')
    expect(wrapper.text()).toContain('Lado B')
    expect(wrapper.text()).toContain('Ferrugem')
    expect(wrapper.get('[role="timer"]').text()).toBe('03:00')
  })

  it.each([
    [scheduled, ['Iniciar luta'], 'before'],
    [{ ...scheduled, status: 'ongoing' }, ['Pausar', 'Encerrar luta'], 'running'],
    [{ ...scheduled, status: 'paused' }, ['Retomar', 'Encerrar luta'], 'running'],
    [finished, ['Fechar luta'], 'ended'],
    [closed, [], 'ended'],
  ] as const)(
    'uses the server state to show the matching controls and recording phase (%j)',
    async (snapshot, labels, phase) => {
      firstFrame = snapshot
      const { wrapper, router, button } = await mountFight()

      expect(fightLabels.filter((label) => button(label))).toEqual(labels)
      expect(wrapper.getComponent(FightRecorderPanel).props('fightPhase')).toBe(phase)
      expect(router.currentRoute.value.name).toBe('match-operation')
    },
  )

  it.each([
    [finished, 'Encerrada pelo operador'],
    [{ ...finished, endReason: 'time_out' }, 'Tempo esgotado'],
    [{ ...finished, endReason: 'surrender' }, 'Desistência'],
  ] as const)('shows the frozen result and rounds the time up (%s)', async (snapshot, reason) => {
    firstFrame = snapshot
    const { wrapper } = await mountFight()

    expect(wrapper.text()).toContain(reason)
    expect(wrapper.get('[role="timer"]').text()).toBe('01:15')
  })

  it('shows which side surrendered', async () => {
    firstFrame = { ...finished, endReason: 'surrender', winnerSide: 'A' }
    const { wrapper } = await mountFight()

    expect(wrapper.text()).toContain('Desistência do lado B')
    expect(wrapper.get('.fight-card__side--b').text()).toContain('Desistiu')
    expect(wrapper.get('.fight-card__side--a').text()).not.toContain('Desistiu')
  })

  it('allows Start with a selected arena and an unavailable camera', async () => {
    cameraError.value = 'Câmera indisponível.'
    post.mockResolvedValueOnce({ ...scheduled, status: 'ongoing' })
    const { wrapper, button, click } = await mountFight()
    expect(wrapper.text()).toContain('Câmera indisponível.')
    expect(button('Iniciar luta')?.attributes('disabled')).toBeUndefined()

    await click('Iniciar luta')
    expect(post).toHaveBeenCalledExactlyOnceWith(
      'm1',
      'start',
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(button('Pausar')).toBeDefined()
  })

  it('starts a scheduled fight without an arena and still offers to select one', async () => {
    firstFrame = { ...scheduled, hasSelectedArena: false }
    const { button, link } = await mountFight()
    expect(button('Iniciar luta')).toBeDefined()
    expect(button('Iniciar luta')?.attributes('disabled')).toBeUndefined()
    expect(link('Selecionar arena')?.attributes('href')).toBe('/operator')
  })

  it('sends Start when the operator clicks it without an arena', async () => {
    firstFrame = { ...scheduled, hasSelectedArena: false }
    post.mockResolvedValueOnce({ ...scheduled, status: 'ongoing', hasSelectedArena: false })
    const { button, click } = await mountFight()

    await click('Iniciar luta')

    expect(post).toHaveBeenCalledExactlyOnceWith(
      'm1',
      'start',
      expect.any(String),
      expect.any(AbortSignal),
    )
    expect(button('Pausar')).toBeDefined()
  })

  it('does not offer arena selection once the fight has started', async () => {
    firstFrame = { ...scheduled, status: 'ongoing', hasSelectedArena: false }
    const { link } = await mountFight()
    expect(link('Selecionar arena')).toBeUndefined()
  })

  it('disables controls during a command and after the channel is refused, retaining the recorder', async () => {
    const pending = deferred<OperatorFightState>()
    post.mockReturnValueOnce(pending.promise)
    const { wrapper, button, click } = await mountFight()
    const recorder = wrapper.getComponent(FightRecorderPanel).element
    await click('Iniciar luta')
    expect(button('Iniciar luta')?.attributes('disabled')).toBeDefined()
    pending.resolve({ ...scheduled, status: 'ongoing' })
    await flushPromises()
    expect(button('Pausar')?.attributes('disabled')).toBeUndefined()
    channel!.onStatus('rejected')
    await flushPromises()
    expect(button('Pausar')?.attributes('disabled')).toBeDefined()
    expect(wrapper.getComponent(FightRecorderPanel).element).toBe(recorder)
  })

  it('requires confirmation to return to controls while a command is uncertain', async () => {
    post.mockRejectedValueOnce(new ApiError(0, 'offline'))
    const { click, button } = await mountFight()
    await click('Iniciar luta')
    expect(button('Iniciar luta')?.attributes('disabled')).toBeDefined()
    expect(button('Tentar atualizar')).toBeDefined()

    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await click('Voltar aos controles')
    expect(get).toHaveBeenCalledTimes(1)
    await click('Voltar aos controles')
    expect(window.confirm).toHaveBeenLastCalledWith(expect.stringContaining('ainda pode'))
    expect(get).toHaveBeenCalledTimes(2)
    expect(button('Iniciar luta')?.attributes('disabled')).toBeUndefined()
  })

  it.each([
    [{ ...scheduled, status: 'paused' }, 'Encerrar luta'],
    [finished, 'Fechar luta'],
  ] as const)('does not send %s when confirmation is canceled (%s)', async (snapshot, label) => {
    firstFrame = snapshot
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    const { click } = await mountFight()
    await click(label)
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(post).not.toHaveBeenCalled()
  })

  it('returns to operator home after the POST confirms a local Close', async () => {
    firstFrame = finished
    post.mockResolvedValueOnce(closed)
    const { click, router } = await mountFight()
    await click('Fechar luta')
    expect(router.currentRoute.value.name).toBe('operator')
  })

  it('returns to operator home after a later pushed frame confirms an uncertain Close', async () => {
    firstFrame = finished
    get.mockResolvedValueOnce(finished)
    post.mockRejectedValueOnce(new ApiError(0, 'offline'))
    const { click, router } = await mountFight()
    await click('Fechar luta')
    expect(router.currentRoute.value.name).toBe('match-operation')

    await push(closed)
    expect(router.currentRoute.value.name).toBe('operator')
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('keeps the closed fight and the unsent video when navigation is canceled', async () => {
    firstFrame = finished
    post.mockResolvedValueOnce(closed)
    vi.mocked(window.confirm).mockReturnValueOnce(true)
    const { wrapper, router, click, link, button } = await mountFight()
    video.value = new Blob(['partial video'], { type: 'video/webm' })
    await flushPromises()
    const recorder = wrapper.getComponent(FightRecorderPanel).element
    await click('Fechar luta')

    expect(router.currentRoute.value.name).toBe('match-operation')
    // The unsent video is guarded by the in-app window, not by a native dialog
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[role="alertdialog"]').text()).toContain('a gravação será perdida')
    await click('Continuar na luta')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('match-operation')
    expect(wrapper.text()).toContain('Luta fechada')
    expect(link('Voltar à operação')?.attributes('href')).toBe('/operator')
    expect(button('Fechar luta')).toBeUndefined()
    expect(button('Enviar')).toBeDefined()
    expect(button('Baixar')).toBeDefined()
    expect(wrapper.getComponent(FightRecorderPanel).element).toBe(recorder)
  })

  it('stays on the closed screen after an external Close', async () => {
    firstFrame = finished
    const { wrapper, router, button } = await mountFight()
    await push(closed)
    expect(router.currentRoute.value.name).toBe('match-operation')
    expect(wrapper.text()).toContain('Luta fechada')
    expect(button('Fechar luta')).toBeUndefined()
  })
})
