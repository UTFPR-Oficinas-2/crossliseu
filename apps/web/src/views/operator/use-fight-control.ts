import { computed, onScopeDispose, readonly, ref, shallowRef, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { ApiError } from '@/api/client'
import { getFightState, sendFightCommand, type FightCommand, type OperatorFightState } from '@/data'

const POLL_INTERVAL_MS = 1_000
const REQUEST_TIMEOUT_MS = 10_000
const COUNTDOWN_INTERVAL_MS = 100

const commandsByStatus: Record<OperatorFightState['status'], readonly FightCommand[]> = {
  scheduled: ['start'],
  ongoing: ['pause', 'finish'],
  paused: ['resume', 'finish'],
  finished: ['close'],
}

function permitsCommand(state: OperatorFightState, command: FightCommand): boolean {
  return (
    !state.closed &&
    commandsByStatus[state.status].includes(command) &&
    (command !== 'start' || state.hasSelectedArena)
  )
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
    ![null, 'manual', 'surrender', 'time_out'].includes(snapshot.endReason)
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
  let pollTimer: ReturnType<typeof setTimeout> | undefined
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

  function pollLater() {
    clearTimeout(pollTimer)
    pollTimer = setTimeout(() => void read(), POLL_INTERVAL_MS)
  }

  function cancelRead() {
    const previous = activeRead
    activeRead = null
    previous?.controller.abort()
  }

  function read(): Promise<boolean> {
    if (disposed || activeCommand) return Promise.resolve(false)
    if (activeRead) return activeRead.result

    clearTimeout(pollTimer)
    const id = toValue(matchId)
    const version = generation
    const controller = new AbortController()
    const current = () => version === generation && activeRead?.controller === controller
    const result = (async () => {
      try {
        const snapshot = await requestWithTimeout(controller, (signal) => getFightState(id, signal))
        if (!current()) return false
        apply(checkSnapshot(snapshot, id))
        return true
      } catch (cause) {
        if (!current()) return false
        if (!state.value && cause instanceof ApiError && [400, 404].includes(cause.status)) {
          loadState.value = 'not-found'
          readError.value = null
        } else {
          loadState.value = 'error'
          readError.value = 'Não foi possível atualizar a luta.'
        }
        return false
      } finally {
        if (current()) {
          activeRead = null
          pollLater()
        }
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

  async function command(action: FightCommand): Promise<void> {
    const snapshot = state.value
    const jwt = toValue(token)
    if (
      disposed ||
      !jwt ||
      busy.value ||
      uncertainCommand.value ||
      loadState.value !== 'ready' ||
      !snapshot ||
      !permitsCommand(snapshot, action)
    ) {
      return
    }

    clearTimeout(pollTimer)
    cancelRead()
    const version = generation
    const controller = new AbortController()
    activeCommand = controller
    posting.value = true
    commandError.value = null
    let reconcile = false

    try {
      const updated = await requestWithTimeout(controller, (signal) =>
        sendFightCommand(snapshot.matchId, action, jwt, signal),
      )
      if (version !== generation) return
      checkSnapshot(updated, snapshot.matchId)
      if (action === 'close' && !updated.closed) throw new Error('Close was not confirmed')
      apply(updated)
      if (action === 'close') confirmedCloseMatchId.value = updated.matchId
    } catch (cause) {
      if (version !== generation) return
      if (!(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500) {
        uncertainCommand.value = action
        shouldNavigateOnClose = action === 'close'
        commandError.value = 'Ainda não foi possível confirmar o comando.'
        reconcile = true
      } else if (cause.status === 409) {
        loadState.value = 'error'
        commandError.value =
          cause.message === 'match_arena_required'
            ? 'Selecione uma arena antes de iniciar a luta.'
            : 'O estado da luta mudou. Confira os controles disponíveis.'
        reconcile = true
      } else {
        commandError.value = 'Não foi possível executar o comando.'
      }
    } finally {
      if (version === generation) {
        activeCommand = null
        posting.value = false
        if (reconcile) await read()
        else pollLater()
      }
    }
  }

  function clearRequests() {
    generation++
    shouldNavigateOnClose = false
    clearTimeout(pollTimer)
    clearInterval(countdownTimer)
    cancelRead()
    activeCommand?.abort()
    activeCommand = null
  }

  function refreshWhenVisible() {
    if (document.visibilityState === 'visible') void read()
  }

  watch(
    () => toValue(matchId),
    () => {
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
      void read()
    },
    { immediate: true, flush: 'sync' },
  )
  document.addEventListener('visibilitychange', refreshWhenVisible)
  onScopeDispose(() => {
    disposed = true
    clearRequests()
    document.removeEventListener('visibilitychange', refreshWhenVisible)
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
  }
}
