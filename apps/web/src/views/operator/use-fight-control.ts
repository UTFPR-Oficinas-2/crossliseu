import { computed, onScopeDispose, readonly, ref, shallowRef, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { ApiError } from '@/api/client'
import { openFightChannel, type FightChannelStatus } from '@/api/fight-channel'
import {
  correctEndReason as sendEndReasonCorrection,
  getFightState,
  sendFightCommand,
  type EndReasonCorrection,
  type FightCommand,
  type OperatorFightState,
} from '@/data'

const REQUEST_TIMEOUT_MS = 10_000
const COUNTDOWN_INTERVAL_MS = 100
const READ_ERROR = 'Não foi possível atualizar a luta.'

const commandsByStatus: Record<OperatorFightState['status'], readonly FightCommand[]> = {
  scheduled: ['start'],
  ongoing: ['pause', 'finish'],
  paused: ['resume', 'finish'],
  finished: ['close'],
}

function permitsCommand(state: OperatorFightState, command: FightCommand): boolean {
  return !state.closed && commandsByStatus[state.status].includes(command)
}

function observesTransition(command: FightCommand, state: OperatorFightState): boolean {
  switch (command) {
    case 'start':
      return state.status !== 'scheduled'
    case 'pause':
      return state.status === 'paused' || state.status === 'finished'
    case 'resume':
      return state.status === 'ongoing' || state.status === 'finished'
    case 'finish':
      return state.status === 'finished'
    case 'close':
      return state.closed
  }
}

function isProposal(value: unknown): value is OperatorFightState['proposal'] {
  if (value === null) return true
  const proposal = value as { outcome?: unknown; basis?: unknown } | undefined
  return (
    ['A', 'B', 'draw'].includes(proposal?.outcome as string) &&
    ['surrender', 'points', 'tied'].includes(proposal?.basis as string)
  )
}

function checkSnapshot(snapshot: OperatorFightState, matchId: string): OperatorFightState {
  if (
    snapshot?.matchId !== matchId ||
    !Object.hasOwn(commandsByStatus, snapshot.status) ||
    !Number.isFinite(snapshot.remainingMs) ||
    snapshot.remainingMs < 0 ||
    typeof snapshot.closed !== 'boolean' ||
    (snapshot.closed && snapshot.status !== 'finished') ||
    typeof snapshot.hasSelectedArena !== 'boolean' ||
    typeof snapshot.robots?.A?.name !== 'string' ||
    typeof snapshot.robots?.B?.name !== 'string' ||
    ![null, 'manual', 'surrender', 'time_out'].includes(snapshot.endReason) ||
    typeof snapshot.draw !== 'boolean' ||
    !isProposal(snapshot.proposal) ||
    ![null, 'A', 'B'].includes(snapshot.surrenderedSide)
  ) {
    throw new Error('Invalid operator fight snapshot')
  }
  return snapshot
}

async function requestWithTimeout<T>(
  controller: AbortController,
  request: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const { signal } = controller
  let onAbort: () => void
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
  })
  const deadline = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await Promise.race([request(signal), aborted])
  } finally {
    clearTimeout(deadline)
    signal.removeEventListener('abort', onAbort!)
  }
}

type LoadState = 'loading' | 'ready' | 'not-found' | 'error'
type PendingRead = { controller: AbortController; result: Promise<boolean> }

export function useFightControl(
  matchId: MaybeRefOrGetter<string>,
  token: MaybeRefOrGetter<string>,
) {
  const state = shallowRef<OperatorFightState | null>(null)
  const loadState = ref<LoadState>('loading')
  const remainingMs = ref(0)
  const posting = ref(false)
  const recovering = ref(false)
  const busy = computed(() => posting.value || recovering.value)
  const readError = ref<string | null>(null)
  const commandError = ref<string | null>(null)
  const error = computed(() => readError.value ?? commandError.value)
  const uncertainCommand = ref<FightCommand | null>(null)
  const confirmedCloseMatchId = ref<string | null>(null)

  let generation = 0
  let disposed = false
  let shouldNavigateOnClose = false
  let activeRead: PendingRead | null = null
  let activeCommand: AbortController | null = null
  let channel: { close(): void } | null = null
  let channelVersion = 0
  // A correction whose response was lost; its error clears once a snapshot shows it landed
  let unconfirmedCorrection: EndReasonCorrection | null = null
  // Counts pushed frames applied, so a slower HTTP response never overwrites a fresher frame
  let framesApplied = 0
  let countdownTimer: ReturnType<typeof setInterval> | undefined

  function apply(snapshot: OperatorFightState) {
    clearInterval(countdownTimer)
    state.value = snapshot
    loadState.value = 'ready'
    readError.value = null
    remainingMs.value = snapshot.remainingMs

    if (snapshot.status === 'ongoing' && snapshot.remainingMs > 0) {
      const receivedAt = performance.now()
      countdownTimer = setInterval(() => {
        remainingMs.value = Math.max(0, snapshot.remainingMs - (performance.now() - receivedAt))
        if (remainingMs.value === 0) clearInterval(countdownTimer)
      }, COUNTDOWN_INTERVAL_MS)
    }

    const correction = unconfirmedCorrection
    if (
      correction &&
      snapshot.endReason === correction.endReason &&
      snapshot.surrenderedSide === (correction.side ?? null)
    ) {
      unconfirmedCorrection = null
      commandError.value = null
    }

    const pending = uncertainCommand.value
    if (pending && observesTransition(pending, snapshot)) {
      uncertainCommand.value = null
      commandError.value = null
      if (pending === 'close' && shouldNavigateOnClose) {
        shouldNavigateOnClose = false
        confirmedCloseMatchId.value = snapshot.matchId
      }
    }
  }

  function onFrame(data: unknown, id: string) {
    let snapshot: OperatorFightState
    try {
      snapshot = checkSnapshot(data as OperatorFightState, id)
    } catch {
      return
    }
    framesApplied++
    apply(snapshot)
  }

  function onChannelStatus(status: FightChannelStatus) {
    if (status === 'reconnecting' || status === 'rejected') {
      // Once a frame arrived the last state stays usable while the channel reconnects
      if (!state.value || status === 'rejected') loadState.value = 'error'
      readError.value = READ_ERROR
    } else if (status === 'not-found') {
      // The match is gone: keep the last state (the recorder still needs it) but stop ticking
      clearInterval(countdownTimer)
      loadState.value = 'not-found'
      readError.value = null
    }
  }

  function closeChannel() {
    channelVersion++
    channel?.close()
    channel = null
  }

  function openChannel(id: string, jwt: string) {
    const version = channelVersion
    const current = () => !disposed && version === channelVersion
    channel = openFightChannel({
      matchId: id,
      token: jwt,
      onState: (data) => {
        if (current()) onFrame(data, id)
      },
      onStatus: (status) => {
        if (current()) onChannelStatus(status)
      },
    })
  }

  function cancelRead() {
    const previous = activeRead
    activeRead = null
    previous?.controller.abort()
  }

  function read(): Promise<boolean> {
    if (disposed || activeCommand) return Promise.resolve(false)
    if (activeRead) return activeRead.result

    const id = toValue(matchId)
    const version = generation
    const seen = framesApplied
    const controller = new AbortController()
    const current = () => version === generation && activeRead?.controller === controller
    const result = (async () => {
      try {
        const snapshot = await requestWithTimeout(controller, (signal) => getFightState(id, signal))
        if (!current()) return false
        const checked = checkSnapshot(snapshot, id)
        // A frame pushed meanwhile is at least as fresh as this response
        if (framesApplied === seen) apply(checked)
        return true
      } catch (cause) {
        if (!current()) return false
        if (framesApplied !== seen) return true
        if (!state.value && cause instanceof ApiError && [400, 404].includes(cause.status)) {
          loadState.value = 'not-found'
          readError.value = null
        } else {
          loadState.value = 'error'
          readError.value = READ_ERROR
        }
        return false
      } finally {
        if (current()) activeRead = null
      }
    })()
    activeRead = { controller, result }
    return result
  }

  async function refresh(): Promise<void> {
    await read()
  }

  async function resumeControls(): Promise<void> {
    if (disposed || busy.value || !uncertainCommand.value) return
    const version = generation
    recovering.value = true
    shouldNavigateOnClose = false
    cancelRead()
    try {
      if ((await read()) && version === generation) {
        uncertainCommand.value = null
        commandError.value = null
      }
    } finally {
      if (version === generation) recovering.value = false
    }
  }

  /**
   * Posts one operator request when nothing else runs and `permits` the current snapshot, then
   * applies its body unless a pushed frame got there first. `check` may throw to reject the body
   * before it is applied; `fail` reports an error and says
   * whether to reconcile with one read.
   */
  async function submit(
    permits: (snapshot: OperatorFightState) => boolean,
    send: (matchId: string, jwt: string, signal: AbortSignal) => Promise<OperatorFightState>,
    handlers: {
      check?: (updated: OperatorFightState) => void
      done?: (updated: OperatorFightState) => void
      fail: (cause: unknown) => boolean
    },
  ): Promise<void> {
    const snapshot = state.value
    const jwt = toValue(token)
    if (
      disposed ||
      !jwt ||
      busy.value ||
      uncertainCommand.value ||
      loadState.value !== 'ready' ||
      !snapshot ||
      !permits(snapshot)
    ) {
      return
    }

    cancelRead()
    const version = generation
    const seen = framesApplied
    const controller = new AbortController()
    activeCommand = controller
    posting.value = true
    commandError.value = null
    unconfirmedCorrection = null
    let reconcile = false

    try {
      const updated = await requestWithTimeout(controller, (signal) =>
        send(snapshot.matchId, jwt, signal),
      )
      if (version !== generation) return
      checkSnapshot(updated, snapshot.matchId)
      handlers.check?.(updated)
      // Frames applied while the request was in flight already hold equal or fresher state
      if (framesApplied === seen) apply(updated)
      handlers.done?.(updated)
    } catch (cause) {
      if (version !== generation) return
      reconcile = handlers.fail(cause)
    } finally {
      if (version === generation) {
        activeCommand = null
        posting.value = false
        if (reconcile) await read()
      }
    }
  }

  /** A 409 means the fight moved on: show it and read the current state */
  function conflicted(cause: unknown): boolean {
    if (!(cause instanceof ApiError) || cause.status !== 409) return false
    loadState.value = 'error'
    commandError.value = 'O estado da luta mudou. Confira os controles disponíveis.'
    return true
  }

  const unconfirmed = (cause: unknown) =>
    !(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500

  /** `options.draw` only matters for Close: it confirms a draw instead of the proposal (#50) */
  function command(action: FightCommand, options?: { draw?: boolean }): Promise<void> {
    return submit(
      (snapshot) => permitsCommand(snapshot, action),
      (id, jwt, signal) =>
        options
          ? sendFightCommand(id, action, jwt, signal, options)
          : sendFightCommand(id, action, jwt, signal),
      {
        check: (updated) => {
          if (action === 'close' && !updated.closed) throw new Error('Close was not confirmed')
        },
        done: (updated) => {
          if (action === 'close') confirmedCloseMatchId.value = updated.matchId
        },
        fail: (cause) => {
          if (unconfirmed(cause)) {
            uncertainCommand.value = action
            shouldNavigateOnClose = action === 'close'
            commandError.value = 'Ainda não foi possível confirmar o comando.'
            return true
          }
          if (conflicted(cause)) return true
          commandError.value = 'Não foi possível executar o comando.'
          return false
        },
      },
    )
  }

  /** Corrects the end reason of a finished fight before Close (#57); never leaves a command uncertain */
  function correctEndReason(correction: EndReasonCorrection): Promise<void> {
    return submit(
      (snapshot) => permitsCommand(snapshot, 'close'),
      (id, jwt, signal) => sendEndReasonCorrection(id, correction, jwt, signal),
      {
        fail: (cause) => {
          if (unconfirmed(cause)) {
            commandError.value = 'Não foi possível confirmar a correção.'
            unconfirmedCorrection = correction
            return true
          }
          if (conflicted(cause)) return true
          commandError.value = 'Não foi possível corrigir o motivo.'
          return false
        },
      },
    )
  }

  function clearRequests() {
    generation++
    shouldNavigateOnClose = false
    unconfirmedCorrection = null
    clearInterval(countdownTimer)
    cancelRead()
    activeCommand?.abort()
    activeCommand = null
  }

  watch(
    [() => toValue(matchId), () => toValue(token)],
    ([id, jwt], previous) => {
      // A new token only reopens the channel; a new match starts over
      if (!previous || previous[0] !== id) {
        clearRequests()
        state.value = null
        loadState.value = 'loading'
        remainingMs.value = 0
        posting.value = false
        recovering.value = false
        readError.value = null
        commandError.value = null
        uncertainCommand.value = null
        confirmedCloseMatchId.value = null
      }
      closeChannel()
      if (!jwt) {
        loadState.value = 'error'
        readError.value = READ_ERROR
        return
      }
      openChannel(id, jwt)
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => {
    disposed = true
    clearRequests()
    closeChannel()
  })

  return {
    state: readonly(state),
    loadState: readonly(loadState),
    remainingMs: readonly(remainingMs),
    busy,
    error,
    uncertainCommand: readonly(uncertainCommand),
    confirmedCloseMatchId: readonly(confirmedCloseMatchId),
    refresh,
    resumeControls,
    command,
    correctEndReason,
  }
}
