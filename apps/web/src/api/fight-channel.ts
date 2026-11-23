// Browser client for the API's `/fights` WebSocket (see docs/fight-channel-protocol.md). It
// authenticates, forwards `state` frames, and reconnects with jittered backoff until closed or
// told the failure is terminal (4001 bad credentials, 4005 match not found).
import { apiWebSocketUrl, reportUnauthorized } from './client'

export type FightChannelStatus = 'connecting' | 'open' | 'reconnecting' | 'rejected' | 'not-found'

export interface FightChannelOptions {
  matchId: string
  /** Operator login JWT */
  token: string
  onState: (data: unknown) => void
  onStatus: (status: FightChannelStatus) => void
}

// The server pings every 10 s (PING_INTERVAL_MS); no frame for three intervals means half-open.
const WATCHDOG_MS = 30_000
const BACKOFF_BASE_MS = 500
const BACKOFF_CAP_MS = 10_000
const JITTER = 0.2
const CLOSE_BAD_CREDENTIALS = 4001
const CLOSE_MATCH_NOT_FOUND = 4005

export function openFightChannel(options: FightChannelOptions): { close(): void } {
  const { matchId, token, onState, onStatus } = options
  let socket: WebSocket | null = null
  let watchdog: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0
  let closed = false

  function clearTimers() {
    if (watchdog) clearTimeout(watchdog)
    if (retryTimer) clearTimeout(retryTimer)
    watchdog = null
    retryTimer = null
  }

  function scheduleReconnect() {
    onStatus('reconnecting')
    const base = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS)
    attempt++
    const delay = base * (1 + JITTER * (Math.random() * 2 - 1))
    retryTimer = setTimeout(connect, delay)
  }

  function connect() {
    retryTimer = null
    onStatus('connecting')
    const ws = new WebSocket(apiWebSocketUrl('/fights'))
    socket = ws
    // Events from a replaced or closed socket must not touch state.
    const current = () => !closed && socket === ws
    let opened = false

    function armWatchdog() {
      if (watchdog) clearTimeout(watchdog)
      watchdog = setTimeout(() => {
        if (!current()) return
        socket = null
        ws.close()
        scheduleReconnect()
      }, WATCHDOG_MS)
    }

    armWatchdog()

    ws.onopen = () => {
      if (!current()) return
      ws.send(JSON.stringify({ event: 'auth', data: { matchId, token } }))
    }

    ws.onmessage = (event) => {
      if (!current()) return
      armWatchdog()
      let frame: unknown
      try {
        frame = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (typeof frame !== 'object' || frame === null) return
      const { event: name, data } = frame as { event?: unknown; data?: unknown }
      if (name !== 'state') return
      attempt = 0
      if (!opened) onStatus('open')
      opened = true
      onState(data)
    }

    ws.onclose = (event) => {
      if (!current()) return
      socket = null
      if (watchdog) clearTimeout(watchdog)
      watchdog = null
      if (event.code === CLOSE_BAD_CREDENTIALS) {
        onStatus('rejected')
        reportUnauthorized()
      } else if (event.code === CLOSE_MATCH_NOT_FOUND) {
        onStatus('not-found')
      } else {
        scheduleReconnect()
      }
    }
  }

  connect()

  return {
    close() {
      if (closed) return
      closed = true
      clearTimers()
      const ws = socket
      socket = null
      ws?.close()
    },
  }
}
