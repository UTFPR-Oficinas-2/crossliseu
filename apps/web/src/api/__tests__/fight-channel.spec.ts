import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { openFightChannel, type FightChannelStatus } from '../fight-channel'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  readonly url: string
  sent: string[] = []
  closeCalls = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.closeCalls++
  }

  open() {
    this.onopen?.()
  }

  message(data: unknown) {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) })
  }

  serverClose(code: number) {
    this.onclose?.({ code })
  }
}

const unauthorized = vi.hoisted(() => vi.fn<() => void>())
vi.mock('../client', () => ({
  apiWebSocketUrl: (path: string) => `ws://localhost/api${path}`,
  reportUnauthorized: unauthorized,
}))

const state = { status: 'running', matchId: 'm' }

describe('openFightChannel', () => {
  const onState = vi.fn<(data: unknown) => void>()
  const onStatus = vi.fn<(status: FightChannelStatus) => void>()
  const last = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!

  function start() {
    return openFightChannel({ matchId: 'm-1', token: 'tok', onState, onStatus })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // jitter factor 1
    FakeWebSocket.instances = []
    onState.mockReset()
    onStatus.mockReset()
    unauthorized.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends auth on open and reports open after the first state frame', () => {
    start()
    expect(onStatus).toHaveBeenLastCalledWith('connecting')
    expect(last().url).toBe('ws://localhost/api/fights')
    last().open()
    expect(JSON.parse(last().sent[0]!)).toEqual({
      event: 'auth',
      data: { matchId: 'm-1', token: 'tok' },
    })
    expect(onStatus).not.toHaveBeenCalledWith('open')
    last().message({ event: 'state', data: state })
    expect(onStatus).toHaveBeenLastCalledWith('open')
  })

  it('sends the referee name in the auth frame', () => {
    openFightChannel({ matchId: 'm-1', token: 'tok', name: 'Ana', onState, onStatus })
    last().open()
    expect(JSON.parse(last().sent[0]!)).toEqual({
      event: 'auth',
      data: { matchId: 'm-1', token: 'tok', name: 'Ana' },
    })
  })

  it('omits name for the operator', () => {
    start()
    last().open()
    expect(JSON.parse(last().sent[0]!).data).not.toHaveProperty('name')
  })

  it('a referee 4001 reports rejected without logging out', () => {
    openFightChannel({
      matchId: 'm-1',
      token: 'tok',
      name: 'Ana',
      logOutOnReject: false,
      onState,
      onStatus,
    })
    last().serverClose(4001)
    expect(onStatus).toHaveBeenLastCalledWith('rejected')
    expect(unauthorized).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('forwards state data and ignores other events, bad JSON and pings', () => {
    start()
    last().open()
    last().message({ event: 'state', data: state })
    last().message({ event: 'error', data: { code: 'x', message: 'y' } })
    last().message('not json')
    last().message({ event: 'ping', data: null })
    expect(onState).toHaveBeenCalledTimes(1)
    expect(onState).toHaveBeenCalledWith(state)
  })

  it('reconnects with a growing backoff, capped at 10 s, and resets after a state', () => {
    start()
    const waits = [500, 1000, 2000, 4000, 8000, 10000, 10000]
    for (const wait of waits) {
      const count = FakeWebSocket.instances.length
      last().serverClose(1006)
      expect(onStatus).toHaveBeenLastCalledWith('reconnecting')
      vi.advanceTimersByTime(wait - 1)
      expect(FakeWebSocket.instances).toHaveLength(count)
      vi.advanceTimersByTime(1)
      expect(FakeWebSocket.instances).toHaveLength(count + 1)
    }
    last().open()
    last().message({ event: 'state', data: state })
    const count = FakeWebSocket.instances.length
    last().serverClose(1006)
    vi.advanceTimersByTime(500)
    expect(FakeWebSocket.instances).toHaveLength(count + 1)
  })

  it('keeps the jitter within plus or minus 20%', () => {
    start()
    vi.mocked(Math.random).mockReturnValue(0)
    last().serverClose(1006) // base 500, lowest 400
    vi.advanceTimersByTime(399)
    expect(FakeWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(2)
    vi.mocked(Math.random).mockReturnValue(0.999999)
    last().serverClose(1006) // base 1000, highest 1200
    vi.advanceTimersByTime(1198)
    expect(FakeWebSocket.instances).toHaveLength(2)
    vi.advanceTimersByTime(2)
    expect(FakeWebSocket.instances).toHaveLength(3)
  })

  it('rejects on 4001: reports, calls the unauthorized handler, no reconnect', () => {
    start()
    last().serverClose(4001)
    expect(onStatus).toHaveBeenLastCalledWith('rejected')
    expect(unauthorized).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(60_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('reports not-found on 4005 without reconnecting or logging out', () => {
    start()
    last().serverClose(4005)
    expect(onStatus).toHaveBeenLastCalledWith('not-found')
    expect(unauthorized).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it.each([4002, 1001, 1006, 1011, 1013])('reconnects after the backoff on close %i', (code) => {
    start()
    last().serverClose(code)
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting')
    expect(FakeWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(499)
    expect(FakeWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(2)
    expect(unauthorized).not.toHaveBeenCalled()
  })

  it('closes and reconnects after 30 s without any frame', () => {
    start()
    const first = last()
    first.open()
    vi.advanceTimersByTime(29_999)
    expect(first.closeCalls).toBe(0)
    vi.advanceTimersByTime(1)
    expect(first.closeCalls).toBe(1)
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting')
    vi.advanceTimersByTime(500)
    expect(FakeWebSocket.instances).toHaveLength(2)
    // the late close event of the dead socket changes nothing
    first.serverClose(1006)
    vi.advanceTimersByTime(1_000)
    expect(FakeWebSocket.instances).toHaveLength(2)
  })

  it('resets the watchdog on every frame', () => {
    start()
    const ws = last()
    ws.open()
    vi.advanceTimersByTime(20_000)
    ws.message({ event: 'ping', data: null })
    vi.advanceTimersByTime(20_000)
    expect(ws.closeCalls).toBe(0)
    vi.advanceTimersByTime(10_000)
    expect(ws.closeCalls).toBe(1)
  })

  it('close() stops everything and reports nothing more', () => {
    const channel = start()
    const ws = last()
    ws.open()
    ws.message({ event: 'state', data: state })
    onStatus.mockClear()
    onState.mockClear()
    channel.close()
    expect(ws.closeCalls).toBe(1)
    ws.message({ event: 'state', data: state })
    ws.serverClose(1006)
    vi.advanceTimersByTime(120_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(onStatus).not.toHaveBeenCalled()
    expect(onState).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('close() cancels a pending reconnect', () => {
    const channel = start()
    last().serverClose(1006)
    onStatus.mockClear()
    channel.close()
    vi.advanceTimersByTime(60_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(onStatus).not.toHaveBeenCalled()
  })
})

describe('apiWebSocketUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function urlFor(apiUrl: string, href: string) {
    vi.stubEnv('VITE_API_URL', apiUrl)
    vi.stubGlobal('window', { location: { href } })
    vi.resetModules()
    const { apiWebSocketUrl } = await vi.importActual<typeof import('../client')>('../client')
    return apiWebSocketUrl('/fights')
  }

  it('uses ws on http', async () => {
    expect(await urlFor('/api', 'http://localhost:5173/matches/1')).toBe(
      'ws://localhost:5173/api/fights',
    )
  })

  it('uses wss on https and keeps a path prefix', async () => {
    expect(await urlFor('/crossliseu/api', 'https://example.com/crossliseu/x')).toBe(
      'wss://example.com/crossliseu/api/fights',
    )
  })
})
