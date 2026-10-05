// `ChampionshipsController` in apps/api (`@Controller('championships')`, no global prefix).
// Shapes mirror the API response; mapping to `@/types` happens in `@/mocks`.
import { apiRequest } from './client'

/** `ChampionshipStatus` in apps/api, set from the dates on create */
export type ApiChampionshipStatus = 'ongoing' | 'scheduled' | 'closed'

/** `Championship` entity plus counts as serialized by apps/api. Dates are ISO strings. */
export interface ApiChampionship {
  id: string
  name: string
  startDate: string
  endDate: string
  status: ApiChampionshipStatus
  robotCount: number
  fightsTotal: number
  /** Matches in the `finished` state */
  fightsDone: number
  createdAt: string
  modifiedAt: string
  deletedAt: string | null
}

/** `CreateChampionshipDto` */
export interface ApiCreateChampionship {
  name: string
  /** ISO date */
  startDate: string
  /** ISO date, not before `startDate` */
  endDate: string
}

/** `UpdateChampionshipDto` (partial create) */
export type ApiUpdateChampionship = Partial<ApiCreateChampionship>

/** GET /championships (public) */
export function listChampionships(): Promise<ApiChampionship[]> {
  return apiRequest('/championships')
}

/** GET /championships/:id (public). 404 `championship_not_found`, 400 for a non-uuid id. */
export function getChampionship(id: string): Promise<ApiChampionship> {
  return apiRequest(`/championships/${encodeURIComponent(id)}`)
}

/** POST /championships (JWT) */
export function createChampionship(
  body: ApiCreateChampionship,
  token: string,
): Promise<ApiChampionship> {
  return apiRequest('/championships', { method: 'POST', body, token })
}

/** PATCH /championships/:id (JWT) */
export function updateChampionship(
  id: string,
  body: ApiUpdateChampionship,
  token: string,
): Promise<ApiChampionship> {
  return apiRequest(`/championships/${encodeURIComponent(id)}`, { method: 'PATCH', body, token })
}

/** DELETE /championships/:id (JWT). 204, soft delete. */
export function deleteChampionship(id: string, token: string): Promise<void> {
  return apiRequest(`/championships/${encodeURIComponent(id)}`, { method: 'DELETE', token })
}
