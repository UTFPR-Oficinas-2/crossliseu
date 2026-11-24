// The referees' own endpoints in apps/api (`RefereeJoinController`, `POST /matches/:id/scores`).
// No account: the match's shared referee token and the referee's name are the credential, so no
// JWT is sent. Errors are `ApiError` with the server code in `details`:
// 401 `referee_invalid_token`, 409 `referee_seats_full`, `match_not_running`, `score_below_zero`.
import { apiRequest } from './client'

export type RefereeSide = 'A' | 'B'
export type RefereeAction = 1 | -1

/** This referee's own count per side (never another referee's) */
export interface RefereeCounts {
  A: number
  B: number
}

export interface RefereeJoin {
  matchId: string
  seat: 1 | 2 | 3
  /** The name as the server stored it (trimmed) */
  name: string
  counts: RefereeCounts
}

/** POST /referee/join. The same name, ignoring case and accents, gets the same seat back. */
export function joinReferee(token: string, name: string): Promise<RefereeJoin> {
  return apiRequest('/referee/join', { method: 'POST', body: { token, name } })
}

/** POST /matches/:id/scores. Returns this referee's own counts after the press. */
export function submitScore(
  matchId: string,
  token: string,
  name: string,
  side: RefereeSide,
  action: RefereeAction,
): Promise<{ counts: RefereeCounts }> {
  return apiRequest(`/matches/${encodeURIComponent(matchId)}/scores`, {
    method: 'POST',
    body: { token, name, side, action },
  })
}
