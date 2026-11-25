import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'
import { ApiError, reportUnauthorized } from '@/api/client'
import {
  openFightChannel,
  type FightChannelOptions,
  type FightChannelStatus,
} from '@/api/fight-channel'
import { correctEndReason, getFightState, sendFightCommand, type OperatorFightState } from '@/data'
import { useFightControl } from '../use-fight-control'

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
  sendFightCommand: vi.fn<typeof sendFightCommand>(),
  correctEndReason: vi.fn<typeof correctEndReason>(),
}))
vi.mock('@/api/fight-channel', () => ({
  openFightChannel: vi.fn<typeof openFightChannel>(),
}))
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  reportUnauthorized: vi.fn<typeof reportUnauthorized>(),
}))

function snapshot(overrides: Partial<OperatorFightState> = {}): OperatorFightState {
  return {
    matchId: 'm1',
    status: 'scheduled',
    remainingMs: 180_000,
    endReason: null,
    robots: { A: { name: 'Tritura' }, B: { name: 'Ferrugem' } },
    score: { A: 0, B: 0 },
    closed: false,
    winnerSide: null,
    draw: false,
    proposal: null,
    surrenderedSide: null,
    hasSelectedArena: true,
    ...overrides,
  }
}

const finished = snapshot({ status: 'finished', remainingMs: 30_000, endReason: 'manual' })
const closed = { ...finished, closed: true, hasSelectedArena: false }
const readError = 'Não foi possível atualizar a luta.'
const get = vi.mocked(getFightState)
const post = vi.mocked(sendFightCommand)
const correct = vi.mocked(correctEndReason)
const open = vi.mocked(openFightChannel)

interface FakeChannel {
  options: FightChannelOptions
  close: ReturnType<typeof vi.fn<() => void>>
  push(data: unknown): void
  status(status: FightChannelStatus): void
}

describe('useFightControl', () => {
  let scope: EffectScope
  let channels: FakeChannel[]
  const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms)
  const channel = () => channels.at(-1)!

  function start(jwt = 'jwt') {
    const id = ref('m1')
    const token = ref(jwt)
    const controls = scope.run(() => useFightControl(id, token))!
    return { id, token, ...controls }
  }

  /** Mounts and delivers the first frame, as the channel does once authenticated. */
  function startWith(first: OperatorFightState) {
    const fight = start()
    channel().push(first)
    return fight
  }

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'],
    })
    channels = []
    open.mockReset().mockImplementation((options) => {
      const fake: FakeChannel = {
        options,
        close: vi.fn<() => void>(),
        push: (data) => options.onState(data),
        status: (status) => options.onStatus(status),
      }
      channels.push(fake)
      return { close: fake.close }
    })
    get.mockReset().mockResolvedValue(snapshot())
    post.mockReset()
    correct.mockReset()
    vi.mocked(reportUnauthorized).mockReset()
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('opens the channel with the match id and JWT and never polls', async () => {
    const fight = start()
    expect(open).toHaveBeenCalledOnce()
    expect(channel().options).toMatchObject({ matchId: 'm1', token: 'jwt' })
    expect(fight.loadState.value).toBe('loading')
    await tick(10_000)
    channel().push(snapshot())
    await tick(10_000)
    expect(get).not.toHaveBeenCalled()
  })

  it('applies a pushed frame and ignores an invalid one', () => {
    const fight = start()
    channel().push(snapshot({ status: 'ongoing', remainingMs: 30_000 }))
    expect(fight.loadState.value).toBe('ready')
    expect(fight.state.value?.status).toBe('ongoing')
    expect(fight.remainingMs.value).toBe(30_000)

    channel().push(snapshot({ status: 'ongoing', remainingMs: 20_000 }))
    expect(fight.remainingMs.value).toBe(20_000)

    channel().push({ status: 'paused' })
    channel().push(snapshot({ matchId: 'other' }))
    channel().push('garbage')
    channel().push(null)
    expect(fight.state.value).toMatchObject({ status: 'ongoing', remainingMs: 20_000 })
    expect(fight.loadState.value).toBe('ready')
  })

  it('interpolates running time to zero and waits for the server to report timeout', async () => {
    const fight = startWith(snapshot({ status: 'ongoing', remainingMs: 2_500 }))
    await tick(1_000)
    expect(fight.remainingMs.value).toBe(1_500)
    await tick(1_500)
    expect(fight.remainingMs.value).toBe(0)
    expect(fight.state.value?.status).toBe('ongoing')
    channel().push(snapshot({ status: 'finished', remainingMs: 0, endReason: 'time_out' }))
    expect(fight.state.value).toMatchObject({ status: 'finished', endReason: 'time_out' })
  })

  it('resyncs ongoing time from each frame and freezes on a pushed Pause', async () => {
    const fight = startWith(snapshot({ status: 'ongoing', remainingMs: 30_000 }))
    await tick(1_000)
    expect(fight.remainingMs.value).toBe(29_000)
    channel().push(snapshot({ status: 'ongoing', remainingMs: 24_500 }))
    expect(fight.remainingMs.value).toBe(24_500)
    await tick(500)
    expect(fight.remainingMs.value).toBe(24_000)
    channel().push(snapshot({ status: 'paused', remainingMs: 21_000 }))
    await tick(2_000)
    expect(fight.state.value?.status).toBe('paused')
    expect(fight.remainingMs.value).toBe(21_000)
  })

  it.each(['scheduled', 'paused', 'finished'] as const)('keeps %s time fixed', async (status) => {
    const fight = startWith(snapshot({ status, remainingMs: 95_600 }))
    await tick(4_000)
    expect(fight.remainingMs.value).toBe(95_600)
  })

  it('shows an error while reconnecting before the first frame', () => {
    const fight = start()
    channel().status('connecting')
    channel().status('reconnecting')
    expect(fight.loadState.value).toBe('error')
    expect(fight.error.value).toBe(readError)

    channel().push(snapshot())
    expect(fight.loadState.value).toBe('ready')
    expect(fight.error.value).toBeNull()
  })

  it('keeps the controls ready while reconnecting after a good frame', () => {
    const fight = startWith(snapshot())
    channel().status('reconnecting')
    expect(fight.loadState.value).toBe('ready')
    expect(fight.error.value).toBe(readError)
    expect(fight.state.value?.status).toBe('scheduled')

    channel().status('connecting')
    channel().push(snapshot({ status: 'ongoing' }))
    channel().status('open')
    expect(fight.loadState.value).toBe('ready')
    expect(fight.error.value).toBeNull()
    expect(fight.state.value?.status).toBe('ongoing')
  })

  it('stops the countdown when the channel reports not-found after a frame', async () => {
    const fight = startWith(snapshot({ status: 'ongoing', remainingMs: 30_000 }))
    await tick(1_000)
    expect(fight.remainingMs.value).toBe(29_000)
    channel().status('not-found')
    expect(fight.loadState.value).toBe('not-found')
    const frozen = fight.remainingMs.value
    await tick(2_000)
    expect(fight.remainingMs.value).toBe(frozen)
  })

  it('reports not-found from the channel', () => {
    const fight = start()
    channel().status('not-found')
    expect(fight.loadState.value).toBe('not-found')
    expect(fight.state.value).toBeNull()
  })

  it('reports a rejected channel as an error without reporting the session again', () => {
    const fight = startWith(snapshot())
    channel().status('rejected')
    expect(fight.loadState.value).toBe('error')
    expect(fight.error.value).toBe(readError)
    expect(reportUnauthorized).not.toHaveBeenCalled()
  })

  it('reopens the channel when the match changes', () => {
    const fight = startWith(finished)
    const first = channel()
    fight.id.value = 'm2'
    expect(first.close).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledTimes(2)
    expect(channel().options).toMatchObject({ matchId: 'm2', token: 'jwt' })
    expect(fight.state.value).toBeNull()
    expect(fight.loadState.value).toBe('loading')

    channel().push(snapshot({ matchId: 'm2' }))
    expect(fight.state.value?.matchId).toBe('m2')
  })

  it('reopens the channel with a new token and keeps the current state', () => {
    const fight = startWith(snapshot())
    const first = channel()
    fight.token.value = 'jwt2'
    expect(first.close).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledTimes(2)
    expect(channel().options).toMatchObject({ matchId: 'm1', token: 'jwt2' })
    expect(fight.state.value?.status).toBe('scheduled')
    expect(fight.loadState.value).toBe('ready')
  })

  it('closes the channel on disposal and leaves no timers', () => {
    startWith(snapshot({ status: 'ongoing', remainingMs: 30_000 }))
    scope.stop()
    expect(channel().close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('opens no channel without a token', () => {
    const fight = start('')
    expect(open).not.toHaveBeenCalled()
    expect(fight.loadState.value).toBe('error')
    expect(reportUnauthorized).not.toHaveBeenCalled()
  })

  it('closes the channel when the token is cleared', () => {
    const fight = startWith(snapshot())
    fight.token.value = ''
    expect(channel().close).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledOnce()
    expect(fight.loadState.value).toBe('error')
  })

  it('registers no visibilitychange listener', () => {
    const listen = vi.spyOn(document, 'addEventListener')
    start()
    expect(listen).not.toHaveBeenCalledWith('visibilitychange', expect.anything())
  })

  it('coalesces manual reads into one one-shot request', async () => {
    const read = deferred<OperatorFightState>()
    get.mockReturnValueOnce(read.promise)
    const fight = start()
    const first = fight.refresh()
    const second = fight.refresh()
    expect(get).toHaveBeenCalledOnce()
    read.resolve(snapshot())
    await Promise.all([first, second])
    expect(fight.loadState.value).toBe('ready')
    await tick(10_000)
    expect(get).toHaveBeenCalledOnce()
  })

  it('does not let a manual read overwrite a fresher pushed frame', async () => {
    const read = deferred<OperatorFightState>()
    get.mockReturnValueOnce(read.promise)
    const fight = startWith(snapshot())
    const refresh = fight.refresh()
    channel().push(snapshot({ status: 'ongoing' }))
    read.resolve(snapshot())
    await refresh
    expect(fight.state.value?.status).toBe('ongoing')
  })

  it('aborts a hung read and ignores its eventual result after retry', async () => {
    const hung = deferred<OperatorFightState>()
    get.mockReturnValueOnce(hung.promise)
    const fight = start()
    void fight.refresh()
    const signal = get.mock.calls[0]?.[1]
    await tick(10_000)
    expect(signal?.aborted).toBe(true)
    expect(fight.loadState.value).toBe('error')

    await fight.refresh()
    hung.resolve(finished)
    await tick()
    expect(fight.loadState.value).toBe('ready')
    expect(fight.state.value?.status).toBe('scheduled')
  })

  it('aborts a read on route changes', async () => {
    const read = deferred<OperatorFightState>()
    get.mockReturnValueOnce(read.promise)
    const fight = start()
    void fight.refresh()
    const signal = get.mock.calls[0]?.[1]
    fight.id.value = 'm2'
    expect(signal?.aborted).toBe(true)
    read.resolve(finished)
    await tick()
    expect(fight.state.value).toBeNull()
  })

  it('reports a 404 read before any frame as not found', async () => {
    get.mockRejectedValueOnce(new ApiError(404, 'match_not_found'))
    const fight = start()
    await fight.refresh()
    expect(fight.loadState.value).toBe('not-found')
    expect(fight.state.value).toBeNull()
  })

  it('allows one command and applies its body when no frame arrived meanwhile', async () => {
    const command = deferred<OperatorFightState>()
    post.mockReturnValueOnce(command.promise)
    const fight = startWith(snapshot())
    const request = fight.command('start')
    expect(fight.busy.value).toBe(true)
    await fight.command('start')

    command.resolve(snapshot({ status: 'ongoing' }))
    await request
    expect(fight.state.value?.status).toBe('ongoing')
    expect(fight.busy.value).toBe(false)
    expect(post).toHaveBeenCalledExactlyOnceWith('m1', 'start', 'jwt', expect.any(AbortSignal))
    expect(get).not.toHaveBeenCalled()
  })

  it('applies frames during a command and does not let the body overwrite them', async () => {
    const command = deferred<OperatorFightState>()
    post.mockReturnValueOnce(command.promise)
    const fight = startWith(snapshot())
    const request = fight.command('start')
    channel().push(snapshot({ status: 'ongoing', remainingMs: 170_000 }))
    expect(fight.state.value?.remainingMs).toBe(170_000)
    channel().push(snapshot({ status: 'paused', remainingMs: 160_000 }))

    command.resolve(snapshot({ status: 'ongoing', remainingMs: 179_900 }))
    await request
    expect(fight.state.value).toMatchObject({ status: 'paused', remainingMs: 160_000 })
    expect(fight.busy.value).toBe(false)
    expect(fight.error.value).toBeNull()
  })

  it('ignores a frame with a malformed draw or proposal (#50)', () => {
    const fight = startWith(finished)
    channel().push({ ...finished, draw: 'no' })
    channel().push({ ...finished, proposal: { outcome: 'C', basis: 'points' } })
    channel().push({ ...finished, proposal: { outcome: 'A', basis: 'luck' } })
    channel().push({ ...finished, proposal: undefined })
    channel().push({ ...finished, surrenderedSide: 'C' })
    expect(fight.state.value).toEqual(finished)

    const proposed = { ...finished, proposal: { outcome: 'A', basis: 'points' } as const }
    channel().push(proposed)
    expect(fight.state.value).toEqual(proposed)
  })

  it('sends a draw call with Close', async () => {
    post.mockResolvedValueOnce({ ...closed, draw: true })
    const fight = startWith(finished)

    await fight.command('close', { draw: true })

    expect(post).toHaveBeenCalledExactlyOnceWith('m1', 'close', 'jwt', expect.any(AbortSignal), {
      draw: true,
    })
    expect(fight.confirmedCloseMatchId.value).toBe('m1')
  })

  it('navigates on a confirmed Close even when a frame arrived first', async () => {
    const command = deferred<OperatorFightState>()
    post.mockReturnValueOnce(command.promise)
    const fight = startWith(finished)
    const request = fight.command('close')
    channel().push(closed)
    expect(fight.confirmedCloseMatchId.value).toBeNull()
    command.resolve(closed)
    await request
    expect(fight.confirmedCloseMatchId.value).toBe('m1')
  })

  it('blocks commands after a failed manual read until a frame arrives', async () => {
    get.mockRejectedValueOnce(new ApiError(500, 'bad read'))
    const fight = startWith(snapshot())
    await fight.refresh()
    expect(fight.loadState.value).toBe('error')
    expect(fight.state.value?.status).toBe('scheduled')
    expect(fight.error.value).toBeTruthy()
    await fight.command('start')
    expect(post).not.toHaveBeenCalled()

    channel().push(snapshot())
    expect(fight.loadState.value).toBe('ready')
    expect(fight.error.value).toBeNull()
  })

  it('reconciles a 409 with one read without retrying Start', async () => {
    const reconciliation = deferred<OperatorFightState>()
    post.mockRejectedValueOnce(new ApiError(409, 'match_invalid_transition'))
    get.mockReturnValueOnce(reconciliation.promise)
    const fight = startWith(snapshot())
    const result = fight.command('start')
    await tick()
    expect(get).toHaveBeenCalledOnce()
    await fight.command('start')
    expect(post).toHaveBeenCalledOnce()
    reconciliation.resolve(snapshot())
    await result
    expect(fight.uncertainCommand.value).toBeNull()
    expect(fight.state.value?.status).toBe('scheduled')
    expect(fight.loadState.value).toBe('ready')
    expect(post).toHaveBeenCalledOnce()
  })

  it('leaves timed-out Close uncertain until a pushed frame reports closed', async () => {
    const hung = deferred<OperatorFightState>()
    get.mockResolvedValueOnce(finished)
    post.mockReturnValueOnce(hung.promise)
    const fight = startWith(finished)
    const command = fight.command('close')

    await tick(10_000)
    await command
    expect(post.mock.calls[0]?.[3]?.aborted).toBe(true)
    expect(get).toHaveBeenCalledOnce()
    expect(fight.uncertainCommand.value).toBe('close')
    expect(fight.confirmedCloseMatchId.value).toBeNull()
    await fight.command('close')
    channel().push(closed)
    expect(fight.uncertainCommand.value).toBeNull()
    expect(fight.confirmedCloseMatchId.value).toBe('m1')
    expect(post).toHaveBeenCalledOnce()
  })

  it('resolves an uncertain Start from the next pushed frame', async () => {
    post.mockRejectedValueOnce(new ApiError(0, 'offline'))
    get.mockRejectedValueOnce(new ApiError(0, 'offline'))
    const fight = startWith(snapshot())
    await fight.command('start')
    expect(fight.uncertainCommand.value).toBe('start')
    channel().push(snapshot({ status: 'ongoing' }))
    expect(fight.uncertainCommand.value).toBeNull()
    expect(fight.error.value).toBeNull()
    expect(fight.loadState.value).toBe('ready')
  })

  it('requires a successful fresh read to recover and drops an unconfirmed Close intent', async () => {
    get
      .mockRejectedValueOnce(new ApiError(500, 'bad read'))
      .mockRejectedValueOnce(new ApiError(0, 'offline'))
      .mockResolvedValueOnce(finished)
    post.mockRejectedValueOnce(new ApiError(502, 'bad response'))
    const fight = startWith(finished)
    await fight.command('close')
    expect(fight.state.value).toEqual(finished)
    expect(fight.loadState.value).toBe('error')
    await fight.resumeControls()
    expect(fight.uncertainCommand.value).toBe('close')
    await fight.resumeControls()
    expect(fight.uncertainCommand.value).toBeNull()
    expect(fight.loadState.value).toBe('ready')
    expect(get).toHaveBeenCalledTimes(3)
    channel().push(closed)
    expect(fight.state.value?.closed).toBe(true)
    expect(fight.confirmedCloseMatchId.value).toBeNull()
    await tick(10_000)
    expect(get).toHaveBeenCalledTimes(3)
  })

  it.each([false, true])(
    'drops the Close navigation intent on explicit recovery, including after a failed read (%s)',
    async (failedRecovery) => {
      get.mockResolvedValueOnce(finished)
      if (failedRecovery) get.mockRejectedValueOnce(new ApiError(500, 'bad read'))
      get.mockResolvedValueOnce(closed)
      post.mockRejectedValueOnce(new ApiError(0, 'offline'))
      const fight = startWith(finished)
      await fight.command('close')

      await fight.resumeControls()
      expect(fight.uncertainCommand.value).toBe(failedRecovery ? 'close' : null)
      if (failedRecovery) await fight.refresh()
      expect(fight.state.value?.closed).toBe(true)
      expect(fight.uncertainCommand.value).toBeNull()
      expect(fight.confirmedCloseMatchId.value).toBeNull()
    },
  )

  it('treats a malformed success payload as an unknown outcome', async () => {
    get.mockResolvedValue(snapshot({ status: 'ongoing' }))
    post.mockResolvedValueOnce({ status: 'paused' } as OperatorFightState)
    const fight = startWith(snapshot({ status: 'ongoing' }))
    await fight.command('pause')

    expect(fight.state.value?.status).toBe('ongoing')
    expect(fight.uncertainCommand.value).toBe('pause')
  })

  it('discards an unresolved Close when the match changes', async () => {
    const previous = deferred<OperatorFightState>()
    post.mockReturnValueOnce(previous.promise)
    const fight = startWith(finished)
    const command = fight.command('close')
    fight.id.value = 'm2'
    channel().push({ ...closed, matchId: 'm2' })
    previous.resolve(closed)
    await command
    expect(post.mock.calls[0]?.[3]?.aborted).toBe(true)
    expect(fight.state.value?.matchId).toBe('m2')
    expect(fight.uncertainCommand.value).toBeNull()
    expect(fight.confirmedCloseMatchId.value).toBeNull()
  })

  it('does not signal navigation when the fight is already closed on entry', () => {
    const fight = startWith(closed)
    expect(fight.state.value?.closed).toBe(true)
    expect(fight.confirmedCloseMatchId.value).toBeNull()
  })

  describe('correctEndReason (#57)', () => {
    const corrected = {
      ...finished,
      endReason: 'surrender' as const,
      surrenderedSide: 'B' as const,
      proposal: { outcome: 'A' as const, basis: 'surrender' as const },
    }

    it('sends the correction and applies the corrected snapshot', async () => {
      const response = deferred<OperatorFightState>()
      correct.mockReturnValueOnce(response.promise)
      const fight = startWith(finished)

      const request = fight.correctEndReason({ endReason: 'surrender', side: 'B' })
      expect(fight.busy.value).toBe(true)
      response.resolve(corrected)
      await request

      expect(correct).toHaveBeenCalledExactlyOnceWith(
        'm1',
        { endReason: 'surrender', side: 'B' },
        'jwt',
        expect.any(AbortSignal),
      )
      expect(fight.state.value).toEqual(corrected)
      expect(fight.busy.value).toBe(false)
      expect(fight.error.value).toBeNull()
      expect(fight.confirmedCloseMatchId.value).toBeNull()
    })

    it('sends nothing while the fight runs, once it is closed, or while a command runs', async () => {
      const ongoing = startWith(snapshot({ status: 'ongoing' }))
      await ongoing.correctEndReason({ endReason: 'manual' })
      channel().push(closed)
      await ongoing.correctEndReason({ endReason: 'manual' })

      channel().push(finished)
      const hung = deferred<OperatorFightState>()
      post.mockReturnValueOnce(hung.promise)
      const close = ongoing.command('close')
      await ongoing.correctEndReason({ endReason: 'manual' })
      hung.resolve(closed)
      await close

      expect(correct).not.toHaveBeenCalled()
    })

    it('reconciles a 409 with one read and says the fight changed', async () => {
      correct.mockRejectedValueOnce(new ApiError(409, 'match_invalid_transition'))
      get.mockResolvedValueOnce(closed)
      const fight = startWith(finished)

      await fight.correctEndReason({ endReason: 'manual' })

      expect(get).toHaveBeenCalledOnce()
      expect(fight.state.value).toEqual(closed)
      expect(fight.error.value).toBe('O estado da luta mudou. Confira os controles disponíveis.')
    })

    it('reads again after a network failure without leaving a command uncertain', async () => {
      correct.mockRejectedValueOnce(new ApiError(0, 'network'))
      get.mockResolvedValueOnce(finished)
      const fight = startWith(finished)

      await fight.correctEndReason({ endReason: 'surrender', side: 'B' })

      expect(get).toHaveBeenCalledOnce()
      expect(fight.uncertainCommand.value).toBeNull()
      expect(fight.error.value).toBe('Não foi possível confirmar a correção.')
    })

    it('clears the error when the read after a failure shows the correction landed', async () => {
      correct.mockRejectedValueOnce(new ApiError(503, 'unavailable'))
      get.mockResolvedValueOnce(corrected)
      const fight = startWith(finished)

      await fight.correctEndReason({ endReason: 'surrender', side: 'B' })

      expect(fight.state.value).toEqual(corrected)
      expect(fight.error.value).toBeNull()
    })

    it('clears the error when a later pushed frame shows the correction landed', async () => {
      correct.mockRejectedValueOnce(new ApiError(0, 'network'))
      get.mockResolvedValueOnce(finished)
      const fight = startWith(finished)

      await fight.correctEndReason({ endReason: 'surrender', side: 'B' })
      expect(fight.error.value).toBe('Não foi possível confirmar a correção.')

      // The other side gave up: not the requested correction, so the error stays
      channel().push({ ...corrected, surrenderedSide: 'A' })
      expect(fight.error.value).toBe('Não foi possível confirmar a correção.')

      channel().push(corrected)
      expect(fight.error.value).toBeNull()
    })

    it('reports a refused correction without reading again', async () => {
      correct.mockRejectedValueOnce(new ApiError(400, 'surrender_side_required'))
      const fight = startWith(finished)

      await fight.correctEndReason({ endReason: 'surrender' })

      expect(get).not.toHaveBeenCalled()
      expect(fight.error.value).toBe('Não foi possível corrigir o motivo.')
    })
  })
})
