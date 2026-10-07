// `RobotsController` in apps/api (`@Controller('robots')`). Shapes mirror the API response;
// mapping to `@/types` happens in `@/mocks`. The API trims names and teams, so a response can
// differ from what was sent.
import type { WeightClass } from '@/types'
import { apiRequest } from './client'

/** `Robot` entity as serialized by apps/api. Dates are ISO strings. */
export interface ApiRobot {
  id: string
  name: string
  /** A `WeightClass`; rows saved before weight classes were fixed may hold other text */
  weightClass: string
  team: string
  championshipId: string
  createdAt: string
  modifiedAt: string
  deletedAt: string | null
}

/** `CreateRobotDto` */
export interface ApiCreateRobot {
  name: string
  /** Anything else is a 400 */
  weightClass: WeightClass
  team: string
  championshipId: string
}

/** `UpdateRobotDto`: a robot stays in the championship it was registered in */
export type ApiUpdateRobot = Partial<Omit<ApiCreateRobot, 'championshipId'>>

/** GET /robots?championshipId= (public), in registration order */
export function listRobots(championshipId: string): Promise<ApiRobot[]> {
  return apiRequest(`/robots?${new URLSearchParams({ championshipId })}`)
}

/** POST /robots (JWT). 404 `championship_not_found`, 409 `robot_name_taken`. */
export function createRobot(body: ApiCreateRobot, token: string): Promise<ApiRobot> {
  return apiRequest('/robots', { method: 'POST', body, token })
}

/** PATCH /robots/:id (JWT). 409 `robot_name_taken`, or `robot_has_matches` on a class change. */
export function updateRobot(id: string, body: ApiUpdateRobot, token: string): Promise<ApiRobot> {
  return apiRequest(`/robots/${encodeURIComponent(id)}`, { method: 'PATCH', body, token })
}

/** DELETE /robots/:id (JWT). 204, soft delete. 409 `robot_has_matches`. */
export function deleteRobot(id: string, token: string): Promise<void> {
  return apiRequest(`/robots/${encodeURIComponent(id)}`, { method: 'DELETE', token })
}
