// A referee's session on their phone (#49): join with the match's shared token and a name, follow
// the fight over the `/fights` socket, and score. One store, because the layout (seat tag), the
// session view and the invalid-access page all read it.
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError } from '@/api/client'
import { openFightChannel, type FightChannelStatus } from '@/api/fight-channel'
import {
  getMatchWinnerSide,
  joinReferee,
  submitScore,
  type RefereeAction,
  type RefereeCounts,
  type RefereeSide,
} from '@/data'
import type { MatchEndReason, MatchState } from '@/types'
import { formatElapsed } from '@/utils/recording'

const STORAGE_PREFIX = 'crossliseu.referee.'
const NAME_MAX_LENGTH = 40
const COUNTDOWN_INTERVAL_MS = 100
// A press with no answer by then fails, so a dead connection can't lock the buttons for the fight
const SCORE_TIMEOUT_MS = 5_000

const STATUSES: readonly MatchState[] = ['scheduled', 'ongoing', 'paused', 'finished']
const END_REASONS: readonly (MatchEndReason | null)[] = [null, 'time_out', 'manual', 'surrender']

export type RefereePhase = 'idle' | 'name' | 'joining' | 'active' | 'finished' | 'invalid'
export type RefereeInvalidReason = 'link' | 'seats_full'

/** The public fight state a referee socket receives */
export interface RefereeFight {
  status: MatchState
  endReason: MatchEndReason | null
  robots: { A: { name: string }; B: { name: string } }
  /** Each side's points summed over the three referees */
  score: { A: number; B: number }
}

export interface RefereeFeedback {
  tone: 'success' | 'warning' | 'danger'
  text: string
}

function readName(token: string): string | null {
  try {
    return localStorage.getItem(STORAGE_PREFIX + token)
  } catch {
    return null
  }
}

function writeName(token: string, name: string | null): void {
  try {
    if (name) localStorage.setItem(STORAGE_PREFIX + token, name)
    else localStorage.removeItem(STORAGE_PREFIX + token)
  } catch {
    // Storage can be blocked (private mode): the name just isn't remembered
  }
}

const isCount = (value: unknown) => typeof value === 'number' && Number.isFinite(value)

/** The frame as the referee needs it, or null when it is for another match or malformed */
function readFrame(
  data: unknown,
  matchId: string,
): { fight: RefereeFight; remainingMs: number } | null {
  const frame = data as Partial<Record<string, unknown>> | null
  const robots = frame?.robots as RefereeFight['robots'] | undefined
  const score = frame?.score as RefereeFight['score'] | undefined
  if (
    frame?.matchId !== matchId ||
    !STATUSES.includes(frame.status as MatchState) ||
    !isCount(frame.remainingMs) ||
    (frame.remainingMs as number) < 0 ||
    !END_REASONS.includes(frame.endReason as MatchEndReason | null) ||
    typeof robots?.A?.name !== 'string' ||
    typeof robots?.B?.name !== 'string' ||
    !isCount(score?.A) ||
    !isCount(score?.B)
  ) {
    return null
  }
  return {
    fight: {
      status: frame.status as MatchState,
      endReason: frame.endReason as MatchEndReason | null,
      robots: { A: { name: robots.A.name }, B: { name: robots.B.name } },
      score: { A: score!.A, B: score!.B },
    },
    remainingMs: frame.remainingMs as number,
  }
}

const hasCode = (error: unknown, code: string) =>
  error instanceof ApiError && error.details.includes(code)

export const useRefereeStore = defineStore('referee', () => {
  const phase = ref<RefereePhase>('idle')
  const invalidReason = ref<RefereeInvalidReason | null>(null)
  const joinError = ref<string | null>(null)
  const token = ref<string | null>(null)
  const matchId = ref<string | null>(null)
  const seat = ref<1 | 2 | 3 | null>(null)
  const name = ref<string | null>(null)
  const ownCounts = ref<RefereeCounts>({ A: 0, B: 0 })
  const fight = ref<RefereeFight | null>(null)
  const remainingMs = ref(0)
  const connection = ref<'live' | 'reconnecting'>('live')
  const feedback = ref<RefereeFeedback | null>(null)
  const pressing = ref(false)
  /** Winning side after a surrender: undefined until known (or if the read failed) */
  const winnerSide = ref<'A' | 'B' | null | undefined>(undefined)

  const canScore = computed(
    () =>
      phase.value === 'active' &&
      fight.value?.status === 'ongoing' &&
      connection.value === 'live' &&
      !pressing.value,
  )

  // Bumped by start() and dispose(): a response or frame from an older session is ignored
  let generation = 0
  let channel: { close(): void } | null = null
  let countdown: ReturnType<typeof setInterval> | undefined

  function stopLive() {
    clearInterval(countdown)
    countdown = undefined
    channel?.close()
    channel = null
  }

  function goInvalid(reason: RefereeInvalidReason) {
    stopLive()
    if (token.value) writeName(token.value, null)
    pressing.value = false
    invalidReason.value = reason
    phase.value = 'invalid'
  }

  function applyFrame(data: unknown) {
    if (!matchId.value || phase.value === 'invalid') return
    const read = readFrame(data, matchId.value)
    if (!read) return
    connection.value = 'live'
    fight.value = read.fight
    clearInterval(countdown)
    remainingMs.value = read.remainingMs
    if (read.fight.status === 'ongoing' && read.remainingMs > 0) {
      const receivedAt = performance.now()
      countdown = setInterval(() => {
        remainingMs.value = Math.max(0, read.remainingMs - (performance.now() - receivedAt))
        if (remainingMs.value === 0) clearInterval(countdown)
      }, COUNTDOWN_INTERVAL_MS)
    }
    if (read.fight.status === 'finished' && phase.value !== 'finished') {
      phase.value = 'finished'
      // Only a surrender has a winner before the result is confirmed (#50)
      if (read.fight.endReason === 'surrender') void loadWinner(generation, matchId.value)
    }
  }

  async function loadWinner(current: number, id: string) {
    try {
      const side = await getMatchWinnerSide(id)
      if (current === generation) winnerSide.value = side
    } catch {
      // The finished screen then says just "DESISTÊNCIA"
    }
  }

  function onChannelStatus(status: FightChannelStatus) {
    if (status === 'rejected' || status === 'not-found') goInvalid('link')
    else if (status === 'reconnecting') connection.value = 'reconnecting'
  }

  function openChannel(current: number) {
    const live = () => current === generation
    channel = openFightChannel({
      matchId: matchId.value!,
      token: token.value!,
      name: name.value!,
      logOutOnReject: false,
      onState: (data) => {
        if (live()) applyFrame(data)
      },
      onStatus: (status) => {
        if (live()) onChannelStatus(status)
      },
    })
  }

  async function start(nextToken: string): Promise<void> {
    stopLive()
    generation++
    phase.value = 'idle'
    invalidReason.value = null
    joinError.value = null
    token.value = nextToken
    matchId.value = null
    seat.value = null
    name.value = null
    ownCounts.value = { A: 0, B: 0 }
    fight.value = null
    remainingMs.value = 0
    connection.value = 'live'
    feedback.value = null
    pressing.value = false
    winnerSide.value = undefined

    const remembered = readName(nextToken)
    if (remembered) await join(remembered)
    else phase.value = 'name'
  }

  async function join(rawName: string): Promise<void> {
    const current = generation
    const trimmed = rawName.trim()
    name.value = trimmed
    if (!trimmed) {
      joinError.value = 'Digite seu nome.'
      phase.value = 'name'
      return
    }
    if (trimmed.length > NAME_MAX_LENGTH) {
      joinError.value = `Use no máximo ${NAME_MAX_LENGTH} caracteres.`
      phase.value = 'name'
      return
    }
    const credential = token.value
    if (!credential) return

    joinError.value = null
    phase.value = 'joining'
    try {
      const joined = await joinReferee(credential, trimmed)
      if (current !== generation) return
      matchId.value = joined.matchId
      seat.value = joined.seat
      name.value = joined.name
      ownCounts.value = joined.counts
      writeName(credential, joined.name)
      phase.value = 'active'
      openChannel(current)
    } catch (error) {
      if (current !== generation) return
      if (error instanceof ApiError && error.status === 401) goInvalid('link')
      else if (hasCode(error, 'referee_seats_full')) goInvalid('seats_full')
      else {
        joinError.value = 'Não foi possível entrar. Tente de novo.'
        phase.value = 'name'
      }
    }
  }

  /** Aborts the request after SCORE_TIMEOUT_MS; the timeout fails like a network error */
  async function submitWithTimeout(side: RefereeSide, action: RefereeAction) {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new ApiError(0, 'Score request timed out'))
      }, SCORE_TIMEOUT_MS)
    })
    try {
      return await Promise.race([
        submitScore(matchId.value!, token.value!, name.value!, side, action, controller.signal),
        timedOut,
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Re-reads this referee's own counts after a press with no answer. Best effort and bounded by
   * SCORE_TIMEOUT_MS, so a bad connection can't keep the buttons locked.
   */
  async function resyncOwnCounts(current: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), SCORE_TIMEOUT_MS)
    })
    try {
      const joined = await Promise.race([
        joinReferee(token.value!, name.value!).catch(() => null),
        timedOut,
      ])
      if (joined && current === generation) ownCounts.value = joined.counts
    } finally {
      clearTimeout(timer)
    }
  }

  async function score(side: RefereeSide, action: RefereeAction): Promise<void> {
    if (!canScore.value || !fight.value) return
    const current = generation
    // What the referee saw when they pressed
    const clock = formatElapsed(Math.ceil(remainingMs.value / 1000))
    const robot = fight.value.robots[side].name
    pressing.value = true
    try {
      const result = await submitWithTimeout(side, action)
      if (current !== generation) return
      ownCounts.value = result.counts
      feedback.value = {
        tone: 'success',
        text: `Ponto ${action === 1 ? 'registrado' : 'retirado'} às ${clock} · ${robot}`,
      }
    } catch (error) {
      if (current !== generation) return
      if (error instanceof ApiError && error.status === 401) {
        goInvalid('link')
        return
      }
      if (hasCode(error, 'score_below_zero')) {
        feedback.value = { tone: 'warning', text: 'Você não tem ponto para tirar deste lado.' }
      } else if (hasCode(error, 'match_not_running')) {
        feedback.value = { tone: 'warning', text: 'A luta não está em andamento.' }
      } else {
        // No answer: the server may have counted the press anyway, so ask it for the real counts
        // before the buttons unlock; otherwise a retry could double-count.
        await resyncOwnCounts(current)
        if (current !== generation) return
        feedback.value = {
          tone: 'danger',
          text: 'Não foi possível confirmar o envio. Confira o placar antes de tentar de novo.',
        }
      }
    } finally {
      if (current === generation) pressing.value = false
    }
  }

  /** Stops the live session. Keeps the phase, reason and token for the invalid-access page. */
  function dispose(): void {
    generation++
    stopLive()
    pressing.value = false
  }

  return {
    phase,
    invalidReason,
    joinError,
    token,
    matchId,
    seat,
    name,
    ownCounts,
    fight,
    remainingMs,
    connection,
    feedback,
    pressing,
    winnerSide,
    canScore,
    start,
    join,
    score,
    dispose,
  }
})
