// Scheduling and operator fight endpoints from MatchesController in apps/api.
import { apiRequest } from './client'
import type { ApiRobot } from './robots'
import type { MatchEndReason, MatchState, WeightClass } from '@/types'

/** `MatchState` in apps/api */
export type ApiMatchState = MatchState

/** `Match` entity as serialized by apps/api. Dates are ISO strings. */
export interface ApiMatch {
  id: string
  /** Shared by both robots; the API takes it from them */
  weightClass: WeightClass
  state: ApiMatchState
  /** When the fight started (ISO), from its `started` event. `null` before Start */
  startedAt: string | null
  /** The arena the fight runs on (set at Start); kept after Close. `null` before Start */
  arenaId: string | null
  endReason: MatchEndReason | null
  /** The confirmed winner: `null` until the operator closes the fight, and on a draw (#50) */
  winnerRobotId: string | null
  /** `true` only for a draw the operator confirmed at close */
  draw: boolean
  /** The robot that gave up, set when the fight ended by surrender */
  surrenderedRobotId: string | null
  championshipId: string
  robotAId: string
  robotBId: string
  /** Included by GET /matches */
  robotA?: ApiRobot
  robotB?: ApiRobot
  createdAt: string
  modifiedAt: string
  deletedAt: string | null
}

/** `CreateMatchDto`. There is no weight class: the API derives it from the robots. */
export interface ApiCreateMatch {
  championshipId: string
  robotAId: string
  robotBId: string
}

/** `UpdateMatchDto` */
export type ApiUpdateMatch = Partial<Pick<ApiCreateMatch, 'robotAId' | 'robotBId'>>

/** GET /matches?championshipId= (public), in creation order */
export function listMatches(championshipId: string): Promise<ApiMatch[]> {
  return apiRequest(`/matches?${new URLSearchParams({ championshipId })}`)
}

/** GET /matches/:id (public). 404 `match_not_found`, 400 for a non-uuid id. */
export function getMatchById(id: string): Promise<ApiMatch> {
  return apiRequest(`/matches/${encodeURIComponent(id)}`)
}

/**
 * POST /matches (JWT). 400 `match_robots_must_differ`, `robot_not_in_championship` or
 * `match_weight_class_mismatch`; 404 `robot_not_found` or `championship_not_found`.
 */
export function createMatch(body: ApiCreateMatch, token: string): Promise<ApiMatch> {
  return apiRequest('/matches', { method: 'POST', body, token })
}

/** PATCH /matches/:id (JWT). Same errors as create, plus 409 `match_not_editable`. */
export function updateMatch(id: string, body: ApiUpdateMatch, token: string): Promise<ApiMatch> {
  return apiRequest(`/matches/${encodeURIComponent(id)}`, { method: 'PATCH', body, token })
}

/** DELETE /matches/:id (JWT). 204, soft delete. 409 `match_not_editable` unless scheduled. */
export function deleteMatch(id: string, token: string): Promise<void> {
  return apiRequest(`/matches/${encodeURIComponent(id)}`, { method: 'DELETE', token })
}

export interface OperatorFightState {
  matchId: string
  status: MatchState
  remainingMs: number
  endReason: MatchEndReason | null
  robots: { A: { name: string }; B: { name: string } }
  /** Each side's points summed over the three referees */
  score: { A: number; B: number }
  closed: boolean
  hasSelectedArena: boolean
  /** The confirmed winner's side, set only once the fight is closed with a winner (#50) */
  winnerSide: 'A' | 'B' | null
  /** `true` once the fight is closed as a draw */
  draw: boolean
  /** What closing would confirm; only while finished and not closed */
  proposal: ResultProposal | null
}

/** Why the server proposes the result: a surrender, more points, or equal points */
export type ResultBasis = 'surrender' | 'points' | 'tied'

/** The result closing the fight would confirm (`docs/fight-channel-protocol.md`) */
export interface ResultProposal {
  outcome: 'A' | 'B' | 'draw'
  basis: ResultBasis
}

export type FightCommand = 'start' | 'pause' | 'resume' | 'finish' | 'close'

export function getFightState(id: string, signal?: AbortSignal): Promise<OperatorFightState> {
  return apiRequest(`/matches/${encodeURIComponent(id)}/state?view=operator`, {
    signal,
    cache: 'no-store',
  })
}

export function sendFightCommand(
  id: string,
  command: FightCommand,
  token: string,
  signal?: AbortSignal,
): Promise<OperatorFightState> {
  return apiRequest(`/matches/${encodeURIComponent(id)}/${command}?view=operator`, {
    method: 'POST',
    token,
    signal,
  })
}

/**
 * POST /matches/:id/referee-token (JWT, owner-only). The token the match's three referees share;
 * the same on every call. 404 `match_not_found`, 409 `match_closed` once the fight is closed.
 */
export function getRefereeToken(id: string, token: string): Promise<{ token: string }> {
  return apiRequest(`/matches/${encodeURIComponent(id)}/referee-token`, { method: 'POST', token })
}

export type RefereeSeat = { seat: 1 | 2 | 3; name: string }

/** GET /matches/:id/referees (JWT, owner-only). Who holds each seat, by seat. */
export function getRefereeSeats(id: string, token: string): Promise<RefereeSeat[]> {
  return apiRequest(`/matches/${encodeURIComponent(id)}/referees`, { token, cache: 'no-store' })
}

/** DELETE /matches/:id/referees/:seat (JWT, owner-only). 409 `match_started` after Start. */
export function freeRefereeSeat(
  id: string,
  seat: RefereeSeat['seat'],
  token: string,
): Promise<void> {
  return apiRequest(`/matches/${encodeURIComponent(id)}/referees/${seat}`, {
    method: 'DELETE',
    token,
  })
}
