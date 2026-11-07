// `ArenasController` in apps/api (`@Controller('arenas')`). Every route needs the JWT and only
// sees the caller's own arenas; someone else's arena answers like an unknown id.
// Shapes mirror the API response; mapping to `@/types` happens in `@/data`.
import { apiRequest } from './client'

/** `ArenaResponse` in apps/api */
export interface ApiArena {
  id: string
  name: string
  deviceId: string
  /** Always false until the device link exists */
  online: boolean
  currentMatchId: string | null
  currentMatch: { id: string; robotAName: string; robotBName: string } | null
}

/** `DeviceCredentials`: shown once, the token is never stored in plain text */
export interface ApiDeviceCredentials {
  deviceId: string
  token: string
  /** WebSocket address of the server; null when the API has no `ARENA_SERVER_URL` */
  serverUrl: string | null
}

/** GET /arenas (JWT). Only the caller's arenas. */
export function listArenas(token: string): Promise<ApiArena[]> {
  return apiRequest('/arenas', { token })
}

/** POST /arenas (JWT). 201. 409 `arena_name_taken`. */
export function createArena(
  name: string,
  token: string,
): Promise<{ arena: ApiArena; credentials: ApiDeviceCredentials }> {
  return apiRequest('/arenas', { method: 'POST', body: { name }, token })
}

/** PATCH /arenas/:id (JWT). 404 `arena_not_found`, 409 `arena_name_taken`. */
export function renameArena(id: string, name: string, token: string): Promise<ApiArena> {
  return apiRequest(`/arenas/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name }, token })
}

/** POST /arenas/:id/token (JWT). The old token stops working. 404 `arena_not_found`, 409 `arena_match_live`. */
export function rotateArenaToken(id: string, token: string): Promise<ApiDeviceCredentials> {
  return apiRequest(`/arenas/${encodeURIComponent(id)}/token`, { method: 'POST', token })
}

/** DELETE /arenas/:id (JWT). 204, soft delete. 404 `arena_not_found`, 409 `arena_match_live`. */
export function deleteArena(id: string, token: string): Promise<void> {
  return apiRequest(`/arenas/${encodeURIComponent(id)}`, { method: 'DELETE', token })
}

/** DELETE /arenas/:id/current-match (JWT). Closes the arena's match or undoes a pick. 404 `arena_not_found`, 409 `arena_match_live`. */
export function clearArenaCurrentMatch(id: string, token: string): Promise<ApiArena> {
  return apiRequest(`/arenas/${encodeURIComponent(id)}/current-match`, {
    method: 'DELETE',
    token,
  })
}

/**
 * PUT /arenas/:id/current-match (JWT). Makes the match the arena's current one (the operator's
 * pick). 404 `arena_not_found` / `match_not_found`; 409 `match_not_scheduled`,
 * `match_already_current` (current on another arena) or `arena_match_started`.
 */
export function setArenaCurrentMatch(
  id: string,
  matchId: string,
  token: string,
): Promise<ApiArena> {
  return apiRequest(`/arenas/${encodeURIComponent(id)}/current-match`, {
    method: 'PUT',
    body: { matchId },
    token,
  })
}
