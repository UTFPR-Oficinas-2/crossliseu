// `MatchesController` in apps/api (`@Controller('matches')`). Only scheduling lives here: list,
// create, and edit or delete while the match is `waiting`.
import { apiRequest } from './client'
import type { ApiRobot } from './robots'

/** `MatchState` in apps/api, serialized as `status` */
export type ApiMatchStatus = 'waiting' | 'running' | 'paused' | 'finished'

/** `Match` entity as serialized by apps/api. Dates are ISO strings. */
export interface ApiMatch {
  id: string
  /** Shared by both robots; the API takes it from them */
  weightClass: string
  status: ApiMatchStatus
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

/** DELETE /matches/:id (JWT). 204, soft delete. 409 `match_not_editable` unless waiting. */
export function deleteMatch(id: string, token: string): Promise<void> {
  return apiRequest(`/matches/${encodeURIComponent(id)}`, { method: 'DELETE', token })
}
