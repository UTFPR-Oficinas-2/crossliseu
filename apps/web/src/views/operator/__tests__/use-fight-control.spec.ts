import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'
import { ApiError } from '@/api/client'
import { getFightState, sendFightCommand, type OperatorFightState } from '@/data'
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
}))

function snapshot(overrides: Partial<OperatorFightState> = {}): OperatorFightState {
  return {
    matchId: 'm1',
    status: 'scheduled',
    remainingMs: 180_000,
    endReason: null,
    robots: { A: { name: 'Tritura' }, B: { name: 'Ferrugem' } },
    closed: false,
    hasSelectedArena: true,
    ...overrides,
  }
}

const finished = snapshot({ status: 'finished', remainingMs: 30_000, endReason: 'manual' })
const closed = { ...finished, closed: true, hasSelectedArena: false }
const get = vi.mocked(getFightState)
const post = vi.mocked(sendFightCommand)

describe('useFightControl', () => {
  let scope: EffectScope
  const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms)

  function start() {
    const id = ref('m1')
    const controls = scope.run(() => useFightControl(id, 'jwt'))!
    return { id, ...controls }
  }

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'],
    })
    get.mockReset().mockResolvedValue(snapshot())
    post.mockReset()
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
  })

  it('loads initially and waits five seconds after the current read finishes before polling', async () => {
    const initial = deferred<OperatorFightState>()
    get.mockReturnValueOnce(initial.promise)
    const fight = start()
    expect(fight.loadState.value).toBe('loading')
    await tick(6_000)
    expect(get).toHaveBeenCalledTimes(1)

    initial.resolve(snapshot())
    await tick()
    expect(fight.loadState.value).toBe('ready')
    expect(fight.remainingMs.value).toBe(180_000)
    await tick(4_999)
    expect(get).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('interpolates running time to zero and waits for the server to report timeout', async () => {
    get
      .mockResolvedValueOnce(snapshot({ status: 'ongoing', remainingMs: 2_500 }))
      .mockResolvedValueOnce(
        snapshot({ status: 'finished', remainingMs: 0, endReason: 'time_out' }),
      )
    const fight = start()
    await tick(1_000)
    expect(fight.remainingMs.value).toBe(1_500)
    await tick(1_500)
    expect(fight.remainingMs.value).toBe(0)
    expect(fight.state.value?.status).toBe('ongoing')
    await tick(2_500)
    expect(fight.state.value).toMatchObject({ status: 'finished', endReason: 'time_out' })
  })

  it('resyncs ongoing time from each poll and freezes on an external Pause', async () => {
    get
      .mockResolvedValueOnce(snapshot({ status: 'ongoing', remainingMs: 30_000 }))
      .mockResolvedValueOnce(snapshot({ status: 'ongoing', remainingMs: 24_500 }))
      .mockResolvedValueOnce(snapshot({ status: 'paused', remainingMs: 21_000 }))
    const fight = start()
    await tick(6_000)
    expect(fight.remainingMs.value).toBe(23_500)
    await tick(8_000)
    expect(fight.state.value?.status).toBe('paused')
    expect(fight.remainingMs.value).toBe(21_000)
  })

  it.each(['scheduled', 'paused', 'finished'] as const)('keeps %s time fixed', async (status) => {
    get.mockResolvedValueOnce(snapshot({ status, remainingMs: 95_600 }))
    const fight = start()
    await tick(4_000)
    expect(fight.remainingMs.value).toBe(95_600)
  })

  it('coalesces visibility and manual reads with the current poll', async () => {
    const poll = deferred<OperatorFightState>()
    get.mockResolvedValueOnce(snapshot()).mockReturnValueOnce(poll.promise)
    const fight = start()
    await tick(5_000)
    const refresh = fight.refresh()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(get).toHaveBeenCalledTimes(2)
    poll.resolve(snapshot())
    await refresh

    document.dispatchEvent(new Event('visibilitychange'))
    expect(get).toHaveBeenCalledTimes(3)
    vi.restoreAllMocks()
  })

  it('aborts a hung read and ignores its eventual result after retry', async () => {
    const hung = deferred<OperatorFightState>()
    get.mockReturnValueOnce(hung.promise)
    const fight = start()
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

  it('aborts on route changes and stops reads on disposal', async () => {
    const initial = deferred<OperatorFightState>()
    const nextRead = deferred<OperatorFightState>()
    get.mockReturnValueOnce(initial.promise).mockReturnValueOnce(nextRead.promise)
    const fight = start()
    const oldSignal = get.mock.calls[0]?.[1]
    fight.id.value = 'm2'
    expect(oldSignal?.aborted).toBe(true)
    initial.resolve(finished)
    await tick()
    expect(fight.state.value).toBeNull()

    const nextSignal = get.mock.calls[1]?.[1]
    scope.stop()
    expect(nextSignal?.aborted).toBe(true)
    nextRead.resolve(snapshot({ matchId: 'm2' }))
    await tick(20_000)
    expect(fight.state.value).toBeNull()
    expect(get).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('allows one command and prevents a pre-command poll from overwriting it', async () => {
    const poll = deferred<OperatorFightState>()
    const command = deferred<OperatorFightState>()
    get.mockResolvedValueOnce(snapshot()).mockReturnValueOnce(poll.promise)
    post.mockReturnValueOnce(command.promise)
    const fight = start()
    await tick(5_000)
    const request = fight.command('start')
    expect(get.mock.calls[1]?.[1]?.aborted).toBe(true)
    expect(fight.busy.value).toBe(true)
    await fight.command('start')
    await fight.refresh()

    command.resolve(snapshot({ status: 'ongoing' }))
    await request
    poll.resolve(snapshot())
    await tick()
    expect(fight.state.value?.status).toBe('ongoing')
    expect(fight.busy.value).toBe(false)
    expect(post).toHaveBeenCalledExactlyOnceWith('m1', 'start', 'jwt', expect.any(AbortSignal))
  })

  it('reports initial 404 as not found', async () => {
    get.mockRejectedValueOnce(new ApiError(404, 'match_not_found'))
    const fight = start()
    await tick()
    expect(fight.loadState.value).toBe('not-found')
    expect(fight.state.value).toBeNull()
  })

  it('keeps the last snapshot after a failed refresh and blocks commands until a successful read', async () => {
    get.mockResolvedValueOnce(snapshot()).mockRejectedValueOnce(new ApiError(500, 'bad read'))
    const fight = start()
    await tick(5_000)
    expect(fight.loadState.value).toBe('error')
    expect(fight.state.value?.status).toBe('scheduled')
    expect(fight.error.value).toBeTruthy()
    await fight.command('start')
    expect(post).not.toHaveBeenCalled()

    await fight.refresh()
    expect(fight.loadState.value).toBe('ready')
    expect(fight.error.value).toBeNull()
  })

  it('reconciles a 409 without retrying Start after the assignment was removed', async () => {
    const reconciliation = deferred<OperatorFightState>()
    post.mockRejectedValueOnce(new ApiError(409, 'match_arena_required'))
    get.mockResolvedValueOnce(snapshot()).mockReturnValueOnce(reconciliation.promise)
    const fight = start()
    await tick()
    const result = fight.command('start')
    await tick()
    expect(get).toHaveBeenCalledTimes(2)
    await fight.command('start')
    expect(post).toHaveBeenCalledTimes(1)
    reconciliation.resolve(snapshot({ hasSelectedArena: false }))
    await result
    expect(fight.uncertainCommand.value).toBeNull()
    expect(fight.state.value?.hasSelectedArena).toBe(false)
    await fight.command('start')
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('leaves timed-out Close uncertain until a later poll reports closed', async () => {
    const hung = deferred<OperatorFightState>()
    get
      .mockResolvedValueOnce(finished)
      .mockResolvedValueOnce(finished)
      .mockResolvedValueOnce(closed)
    post.mockReturnValueOnce(hung.promise)
    const fight = start()
    await tick()
    const command = fight.command('close')

    await tick(10_000)
    await command
    expect(post.mock.calls[0]?.[3]?.aborted).toBe(true)
    expect(get).toHaveBeenCalledTimes(2)
    expect(fight.uncertainCommand.value).toBe('close')
    expect(fight.confirmedCloseMatchId.value).toBeNull()
    await fight.command('close')
    await tick(5_000)
    expect(fight.uncertainCommand.value).toBeNull()
    expect(fight.confirmedCloseMatchId.value).toBe('m1')
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('requires a successful fresh read to recover and drops an unconfirmed Close intent', async () => {
    get
      .mockResolvedValueOnce(finished)
      .mockRejectedValueOnce(new ApiError(500, 'bad read'))
      .mockRejectedValueOnce(new ApiError(0, 'offline'))
      .mockResolvedValueOnce(finished)
      .mockResolvedValueOnce(closed)
    post.mockRejectedValueOnce(new ApiError(502, 'bad response'))
    const fight = start()
    await tick()
    await fight.command('close')
    expect(fight.state.value).toEqual(finished)
    expect(fight.loadState.value).toBe('error')
    await fight.resumeControls()
    expect(fight.uncertainCommand.value).toBe('close')
    await fight.resumeControls()
    expect(fight.uncertainCommand.value).toBeNull()
    expect(fight.loadState.value).toBe('ready')
    await tick(5_000)
    expect(fight.state.value?.closed).toBe(true)
    expect(fight.confirmedCloseMatchId.value).toBeNull()
  })

  it.each([false, true])(
    'drops the Close navigation intent on explicit recovery, including after a failed read (%s)',
    async (failedRecovery) => {
      get.mockResolvedValueOnce(finished).mockResolvedValueOnce(finished)
      if (failedRecovery) get.mockRejectedValueOnce(new ApiError(500, 'bad read'))
      get.mockResolvedValueOnce(closed)
      post.mockRejectedValueOnce(new ApiError(0, 'offline'))
      const fight = start()
      await tick()
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
    const fight = start()
    await tick()
    await fight.command('pause')

    expect(fight.state.value?.status).toBe('ongoing')
    expect(fight.uncertainCommand.value).toBe('pause')
  })

  it('discards an unresolved Close when the match changes', async () => {
    const previous = deferred<OperatorFightState>()
    get.mockResolvedValueOnce(finished).mockResolvedValueOnce({ ...closed, matchId: 'm2' })
    post.mockReturnValueOnce(previous.promise)
    const fight = start()
    await tick()
    const command = fight.command('close')
    fight.id.value = 'm2'
    await tick()
    previous.resolve(closed)
    await command
    expect(post.mock.calls[0]?.[3]?.aborted).toBe(true)
    expect(fight.state.value?.matchId).toBe('m2')
    expect(fight.uncertainCommand.value).toBeNull()
    expect(fight.confirmedCloseMatchId.value).toBeNull()
  })

  it('does not signal navigation when the fight is already closed on entry', async () => {
    get.mockResolvedValueOnce(closed)
    const fight = start()
    await tick()
    expect(fight.state.value?.closed).toBe(true)
    expect(fight.confirmedCloseMatchId.value).toBeNull()
  })
})
