import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFightState, sendFightCommand, type OperatorFightState } from '../matches'

const snapshot: OperatorFightState = {
  matchId: 'fight /#1',
  status: 'scheduled',
  remainingMs: 180_000,
  endReason: null,
  robots: { A: { name: 'Tritura' }, B: { name: 'Ferrugem' } },
  closed: false,
  winnerSide: null,
  hasSelectedArena: true,
}

describe('operator fight requests', () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
  const signal = new AbortController().signal

  beforeEach(() => {
    fetch.mockReset().mockImplementation(async () => Response.json(snapshot))
    vi.stubGlobal('fetch', fetch)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('reads the encoded fight without browser caching', async () => {
    expect(await getFightState(snapshot.matchId, signal)).toEqual(snapshot)

    const [url, init] = fetch.mock.calls[0]!
    expect(url).toMatch(/\/matches\/fight%20%2F%231\/state\?view=operator$/)
    expect(init).toMatchObject({ method: 'GET', signal, cache: 'no-store' })
  })

  it.each(['start', 'pause', 'resume', 'finish', 'close'] as const)(
    'sends %s as an authenticated POST',
    async (command) => {
      expect(await sendFightCommand(snapshot.matchId, command, 'operator-token', signal)).toEqual(
        snapshot,
      )

      const [url, init] = fetch.mock.calls[0]!
      expect(String(url).endsWith(`/matches/fight%20%2F%231/${command}?view=operator`)).toBe(true)
      expect(init).toMatchObject({
        method: 'POST',
        headers: { Authorization: 'Bearer operator-token' },
        signal,
      })
    },
  )
})
