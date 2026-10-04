// `ChampionshipsController` in apps/api (`@Controller('championships')`, no global prefix).
// Shapes mirror the API response; mapping to `@/types` happens in `@/mocks`.
import { apiRequest } from './client'

/** `Championship` entity as serialized by apps/api. Dates are ISO strings. */
export interface ApiChampionship {
  id: string
  name: string
  scheduledDate: string | null
  createdAt: string
  modifiedAt: string
  deletedAt: string | null
}

/** `CreateChampionshipDto` */
export interface ApiCreateChampionship {
  name: string
  /** ISO date */
  scheduledDate?: string
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
