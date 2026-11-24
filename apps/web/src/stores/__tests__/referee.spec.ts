import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { ApiError } from '@/api/client'
import type { FightChannelOptions } from '@/api/fight-channel'

vi.mock('@/data', () => ({
  joinReferee: vi.fn<typeof import('@/data').joinReferee>(),
  submitScore: vi.fn<typeof import('@/data').submitScore>(),
  getMatchWinnerSide: vi.fn<typeof import('@/data').getMatchWinnerSide>(),
}))
vi.mock('@/api/fight-channel', () => ({
  openFightChannel: vi.fn<typeof import('@/api/fight-channel').openFightChannel>(),
}))

import { openFightChannel } from '@/api/fight-channel'
import { getMatchWinnerSide, joinReferee, submitScore } from '@/data'
import { useRefereeStore } from '../referee'

const TOKEN = 'tok'
const KEY = `crossliseu.referee.${TOKEN}`
const MATCH_ID = 'm-1'

const seated = (name = 'Ana', counts = { A: 0, B: 0 }) => ({
  matchId: MATCH_ID,
  seat: 2 as const,
  name,
  counts,
})

function frame(overrides: Record<string, unknown> = {}) {
  return {
    matchId: MATCH_ID,
    status: 'ongoing',
    remainingMs: 102_000,
    endReason: null,
    robots: { A: { name: 'Marte' }, B: { name: 'Cobalto' } },
    score: { A: 6, B: 2 },
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const apiError = (status: number, code: string) => new ApiError(status, code, [code])

describe('referee store', () => {
  let channels: { options: FightChannelOptions; close: ReturnType<typeof vi.fn<() => void>> }[]
  const channel = () => channels[channels.length - 1]!

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.mocked(joinReferee).mockReset()
    vi.mocked(submitScore).mockReset()
    vi.mocked(getMatchWinnerSide).mockReset()
    vi.mocked(getMatchWinnerSide).mockResolvedValue(null)
    channels = []
    vi.mocked(openFightChannel).mockReset()
    vi.mocked(openFightChannel).mockImplementation((options) => {
      const entry = { options, close: vi.fn<() => void>() }
      channels.push(entry)
      return { close: entry.close }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /** A store joined as Ana with a live frame */
  async function active(overrides: Record<string, unknown> = {}, counts = { A: 0, B: 0 }) {
    localStorage.setItem(KEY, 'Ana')
    vi.mocked(joinReferee).mockResolvedValue(seated('Ana', counts))
    const store = useRefereeStore()
    await store.start(TOKEN)
    channel().options.onStatus('open')
    channel().options.onState(frame(overrides))
    return store
  }

  describe('joining', () => {
    it('start with a remembered name joins and opens the channel', async () => {
      localStorage.setItem(KEY, 'Ana')
      vi.mocked(joinReferee).mockResolvedValue(seated('Ana', { A: 1, B: 2 }))
      const store = useRefereeStore()

      await store.start(TOKEN)

      expect(joinReferee).toHaveBeenCalledWith(TOKEN, 'Ana')
      expect(openFightChannel).toHaveBeenCalledOnce()
      expect(channel().options).toMatchObject({
        matchId: MATCH_ID,
        token: TOKEN,
        name: 'Ana',
        logOutOnReject: false,
      })
      expect(store.phase).toBe('active')
      expect(store.seat).toBe(2)
      expect(store.ownCounts).toEqual({ A: 1, B: 2 })
      expect(store.token).toBe(TOKEN)
    })

    it('start without a remembered name shows the form', async () => {
      const store = useRefereeStore()

      await store.start(TOKEN)

      expect(store.phase).toBe('name')
      expect(joinReferee).not.toHaveBeenCalled()
    })

    it('join trims the name, saves it and opens the channel', async () => {
      vi.mocked(joinReferee).mockResolvedValue(seated('Ana'))
      const store = useRefereeStore()
      await store.start(TOKEN)

      await store.join('  Ana ')

      expect(joinReferee).toHaveBeenCalledWith(TOKEN, 'Ana')
      expect(localStorage.getItem(KEY)).toBe('Ana')
      expect(store.phase).toBe('active')
      expect(openFightChannel).toHaveBeenCalledOnce()
    })

    it('join rejects an empty or 41-character name without a request', async () => {
      const store = useRefereeStore()
      await store.start(TOKEN)

      await store.join('   ')
      expect(store.joinError).toBeTruthy()
      await store.join('a'.repeat(41))

      expect(joinReferee).not.toHaveBeenCalled()
      expect(store.joinError).toBeTruthy()
      expect(store.phase).toBe('name')
    })

    it('join 401 goes to an invalid link and forgets the remembered name', async () => {
      localStorage.setItem(KEY, 'Ana')
      vi.mocked(joinReferee).mockRejectedValue(apiError(401, 'referee_invalid_token'))
      const store = useRefereeStore()

      await store.start(TOKEN)

      expect(store.phase).toBe('invalid')
      expect(store.invalidReason).toBe('link')
      expect(localStorage.getItem(KEY)).toBeNull()
      expect(openFightChannel).not.toHaveBeenCalled()
    })

    it('join 409 referee_seats_full goes to invalid seats_full', async () => {
      vi.mocked(joinReferee).mockRejectedValue(apiError(409, 'referee_seats_full'))
      const store = useRefereeStore()
      await store.start(TOKEN)

      await store.join('Zé')

      expect(store.phase).toBe('invalid')
      expect(store.invalidReason).toBe('seats_full')
    })

    it('a network error on join stays on the form with an error', async () => {
      vi.mocked(joinReferee).mockRejectedValue(new ApiError(0, 'Network error'))
      const store = useRefereeStore()
      await store.start(TOKEN)

      await store.join('Ana')

      expect(store.phase).toBe('name')
      expect(store.joinError).toBeTruthy()
      expect(store.name).toBe('Ana')
    })

    it('localStorage throwing does not break join', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      vi.mocked(joinReferee).mockResolvedValue(seated('Ana'))
      const store = useRefereeStore()

      await store.start(TOKEN)
      expect(store.phase).toBe('name')
      await store.join('Ana')

      expect(store.phase).toBe('active')
    })
  })

  describe('live state', () => {
    it('a frame fills the fight and the countdown runs while ongoing, stopping at 0', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] })
      const store = await active({ remainingMs: 1_500 })

      expect(store.fight).toMatchObject({
        status: 'ongoing',
        robots: { A: { name: 'Marte' }, B: { name: 'Cobalto' } },
        score: { A: 6, B: 2 },
      })
      expect(store.remainingMs).toBe(1_500)
      vi.advanceTimersByTime(1_000)
      expect(store.remainingMs).toBeLessThanOrEqual(500)
      vi.advanceTimersByTime(2_000)
      expect(store.remainingMs).toBe(0)
    })

    it('the countdown is frozen while paused', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] })
      const store = await active({ status: 'paused', remainingMs: 60_000 })

      vi.advanceTimersByTime(5_000)

      expect(store.remainingMs).toBe(60_000)
    })

    it('ignores a frame for another match or with a bad shape', async () => {
      const store = await active()

      channel().options.onState(frame({ matchId: 'other', score: { A: 99, B: 99 } }))
      channel().options.onState({ nope: true })

      expect(store.fight?.score).toEqual({ A: 6, B: 2 })
    })

    it('status finished moves to the finished phase', async () => {
      const store = await active()

      channel().options.onState(frame({ status: 'finished', remainingMs: 0, endReason: 'time_out' }))

      expect(store.phase).toBe('finished')
      expect(store.fight?.endReason).toBe('time_out')
    })

    it('a rejected channel goes to an invalid link and forgets the name', async () => {
      const store = await active()

      channel().options.onStatus('rejected')

      expect(store.phase).toBe('invalid')
      expect(store.invalidReason).toBe('link')
      expect(localStorage.getItem(KEY)).toBeNull()
    })

    it('a not-found channel goes to an invalid link', async () => {
      const store = await active()

      channel().options.onStatus('not-found')

      expect(store.phase).toBe('invalid')
      expect(store.invalidReason).toBe('link')
    })

    it('reconnecting is flagged until the next frame', async () => {
      const store = await active()

      channel().options.onStatus('reconnecting')
      expect(store.connection).toBe('reconnecting')
      expect(store.canScore).toBe(false)
      channel().options.onState(frame())

      expect(store.connection).toBe('live')
      expect(store.canScore).toBe(true)
    })
  })

  describe('result', () => {
    it('reads the winner side once when the fight finishes', async () => {
      vi.mocked(getMatchWinnerSide).mockResolvedValue('A')
      const store = await active()
      expect(store.winnerSide).toBeUndefined()

      channel().options.onState(frame({ status: 'finished', remainingMs: 0, endReason: 'surrender' }))
      channel().options.onState(frame({ status: 'finished', remainingMs: 0, endReason: 'surrender' }))
      await vi.waitFor(() => expect(store.winnerSide).toBe('A'))

      expect(getMatchWinnerSide).toHaveBeenCalledExactlyOnceWith(MATCH_ID)
    })

    it('does not read the winner unless the fight ended by surrender', async () => {
      const store = await active()

      channel().options.onState(frame({ status: 'finished', remainingMs: 0, endReason: 'time_out' }))
      await Promise.resolve()

      expect(getMatchWinnerSide).not.toHaveBeenCalled()
      expect(store.winnerSide).toBeUndefined()
    })

    it('a failed read leaves the winner side unknown', async () => {
      vi.mocked(getMatchWinnerSide).mockRejectedValue(new ApiError(0, 'Network error'))
      const store = await active()

      channel().options.onState(frame({ status: 'finished', remainingMs: 0, endReason: 'surrender' }))
      await vi.waitFor(() => expect(getMatchWinnerSide).toHaveBeenCalled())
      await Promise.resolve()

      expect(store.winnerSide).toBeUndefined()
    })
  })

  describe('scoring', () => {
    it('a press sends the credential and replaces the own counts', async () => {
      const store = await active()
      vi.mocked(submitScore).mockResolvedValue({ counts: { A: 1, B: 0 } })

      await store.score('A', 1)

      expect(submitScore).toHaveBeenCalledWith(MATCH_ID, TOKEN, 'Ana', 'A', 1)
      expect(store.ownCounts).toEqual({ A: 1, B: 0 })
      expect(store.feedback).toEqual({
        tone: 'success',
        text: 'Ponto registrado às 01:42 · Marte',
      })
      expect(store.pressing).toBe(false)
    })

    it('a −1 says the point was removed', async () => {
      const store = await active({}, { A: 0, B: 1 })
      vi.mocked(submitScore).mockResolvedValue({ counts: { A: 0, B: 0 } })

      await store.score('B', -1)

      expect(store.feedback).toEqual({
        tone: 'success',
        text: 'Ponto retirado às 01:42 · Cobalto',
      })
    })

    it.each([
      ['paused', { status: 'paused' }],
      ['scheduled', { status: 'scheduled' }],
    ])('ignores a press while %s', async (_label, overrides) => {
      const store = await active(overrides)

      await store.score('A', 1)

      expect(submitScore).not.toHaveBeenCalled()
    })

    it('ignores a press while reconnecting', async () => {
      const store = await active()
      channel().options.onStatus('reconnecting')

      await store.score('A', 1)

      expect(submitScore).not.toHaveBeenCalled()
    })

    it('ignores a press once finished', async () => {
      const store = await active()
      channel().options.onState(frame({ status: 'finished', remainingMs: 0 }))

      await store.score('A', 1)

      expect(submitScore).not.toHaveBeenCalled()
    })

    it('a second press while one is pending sends one request', async () => {
      const store = await active()
      const pending = deferred<{ counts: { A: number; B: number } }>()
      vi.mocked(submitScore).mockReturnValue(pending.promise)

      const first = store.score('A', 1)
      await store.score('A', 1)
      await store.score('B', 1)
      pending.resolve({ counts: { A: 1, B: 0 } })
      await first

      expect(submitScore).toHaveBeenCalledOnce()
    })

    it.each(['score_below_zero', 'match_not_running'])(
      '%s shows a warning and keeps the own counts',
      async (code) => {
        const store = await active({}, { A: 1, B: 0 })
        vi.mocked(submitScore).mockRejectedValue(apiError(409, code))

        await store.score('A', -1)

        expect(store.ownCounts).toEqual({ A: 1, B: 0 })
        expect(store.feedback?.tone).toBe('warning')
        expect(store.pressing).toBe(false)
      },
    )

    it('a network error says it could not send and unlocks the buttons', async () => {
      const store = await active({}, { A: 1, B: 0 })
      vi.mocked(submitScore).mockRejectedValue(new ApiError(0, 'Network error'))

      await store.score('A', 1)

      expect(store.feedback).toEqual({ tone: 'danger', text: 'Não foi possível enviar. Tente de novo.' })
      expect(store.ownCounts).toEqual({ A: 1, B: 0 })
      expect(store.canScore).toBe(true)
    })

    it('a 401 on a press goes to an invalid link', async () => {
      const store = await active()
      vi.mocked(submitScore).mockRejectedValue(apiError(401, 'referee_invalid_token'))

      await store.score('A', 1)

      expect(store.phase).toBe('invalid')
      expect(channel().close).toHaveBeenCalled()
    })
  })

  describe('lifecycle', () => {
    it('a join response arriving after dispose is ignored', async () => {
      localStorage.setItem(KEY, 'Ana')
      const pending = deferred<ReturnType<typeof seated>>()
      vi.mocked(joinReferee).mockReturnValue(pending.promise)
      const store = useRefereeStore()

      const starting = store.start(TOKEN)
      store.dispose()
      pending.resolve(seated())
      await starting

      expect(openFightChannel).not.toHaveBeenCalled()
      expect(store.seat).toBeNull()
    })

    it('dispose closes the channel and a late score response is ignored', async () => {
      const store = await active()
      const pending = deferred<{ counts: { A: number; B: number } }>()
      vi.mocked(submitScore).mockReturnValue(pending.promise)

      const pressing = store.score('A', 1)
      store.dispose()
      pending.resolve({ counts: { A: 5, B: 5 } })
      await pressing

      expect(channel().close).toHaveBeenCalled()
      expect(store.ownCounts).toEqual({ A: 0, B: 0 })
    })

    it('start with another token closes the previous channel', async () => {
      const store = await active()
      const previous = channel()

      await store.start('other-token')

      expect(previous.close).toHaveBeenCalled()
      expect(store.phase).toBe('name')
      expect(store.token).toBe('other-token')
    })

    it('dispose keeps phase invalid, invalidReason and token', async () => {
      vi.mocked(joinReferee).mockRejectedValue(apiError(409, 'referee_seats_full'))
      const store = useRefereeStore()
      await store.start(TOKEN)
      await store.join('Zé')

      store.dispose()

      expect(store.phase).toBe('invalid')
      expect(store.invalidReason).toBe('seats_full')
      expect(store.token).toBe(TOKEN)
    })

    it('start after an invalid session resets invalidReason and seat', async () => {
      const store = await active()
      channel().options.onStatus('rejected')

      await store.start(TOKEN)

      expect(store.invalidReason).toBeNull()
      expect(store.seat).toBeNull()
      expect(store.phase).toBe('name')
    })
  })
})
