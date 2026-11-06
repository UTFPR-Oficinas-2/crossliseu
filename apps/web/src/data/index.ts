// Data access for pages. Every function is async and talks to apps/api through `@/api/*`; the
// mappers turn API payloads into the `@/types` the screens use. There is no demo data: a page
// whose backend does not exist yet gets a rejected `ApiError` (see `notImplemented`).
import { ApiError } from '@/api/client'
import {
  createChampionship as postChampionship,
  getChampionship as fetchChampionship,
  listChampionships,
  updateChampionship as patchChampionship,
  type ApiChampionship,
} from '@/api/championships'
import { login } from '@/api/auth'
import {
  createMatch as postMatch,
  deleteMatch as removeMatch,
  listMatches,
  updateMatch as patchMatch,
  type ApiMatch,
} from '@/api/matches'
import {
  createRobot as postRobot,
  deleteRobot as removeRobot,
  listRobots,
  updateRobot as patchRobot,
  type ApiRobot,
} from '@/api/robots'
import type {
  Arena,
  Championship,
  Match,
  MatchSummary,
  RefereeAccess,
  Robot,
  WeightClass,
} from '@/types'

function toChampionship(api: ApiChampionship): Championship {
  return {
    id: api.id,
    name: api.name,
    startDate: api.startDate,
    endDate: api.endDate,
    status: api.status,
    robotCount: api.robotCount,
    fightsDone: api.fightsDone,
    fightsTotal: api.fightsTotal,
    createdAt: api.createdAt,
    modifiedAt: api.modifiedAt,
  }
}

/** GET /championships. Errors propagate to the caller. */
export async function getChampionships(): Promise<Championship[]> {
  return (await listChampionships()).map(toChampionship)
}

/** POST /auth/login. Resolves to the JWT; wrong credentials throw `ApiError(401)`. */
export async function signIn(username: string, password: string): Promise<string> {
  return (await login(username, password)).token
}

/** Form payload for create and update; dates are `YYYY-MM-DD` (`CreateChampionshipDto`) */
export interface ChampionshipInput {
  name: string
  startDate: string
  endDate: string
}

/** GET /championships/:id. Unknown or malformed ids resolve to `null`. */
export async function getChampionship(id: string): Promise<Championship | null> {
  try {
    return toChampionship(await fetchChampionship(id))
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null
    throw error
  }
}

/**
 * Championships the signed-in organizer can manage. The API has no roles yet, so this is every
 * championship.
 */
export async function getManagedChampionships(): Promise<Championship[]> {
  return (await listChampionships()).map(toChampionship)
}

/** POST /championships (JWT) */
export async function createChampionship(
  input: ChampionshipInput,
  token: string,
): Promise<Championship> {
  return toChampionship(await postChampionship(input, token))
}

/** PATCH /championships/:id (JWT) */
export async function updateChampionship(
  id: string,
  input: ChampionshipInput,
  token: string,
): Promise<Championship> {
  return toChampionship(await patchChampionship(id, input, token))
}

function toRobot(api: ApiRobot): Robot {
  return {
    id: api.id,
    championshipId: api.championshipId,
    name: api.name,
    team: api.team,
    weightClass: api.weightClass,
    createdAt: api.createdAt,
    modifiedAt: api.modifiedAt,
  }
}

/** GET /robots of a championship, in registration order */
export async function getRobots(championshipId: string): Promise<Robot[]> {
  return (await listRobots(championshipId)).map(toRobot)
}

/** Form payload for create and update (`CreateRobotDto` without the championship) */
export interface RobotInput {
  name: string
  team: string
  weightClass: WeightClass
}

/** POST /robots (JWT) */
export async function createRobot(
  championshipId: string,
  input: RobotInput,
  token: string,
): Promise<Robot> {
  return toRobot(await postRobot({ ...input, championshipId }, token))
}

/** PATCH /robots/:id (JWT) */
export async function updateRobot(id: string, input: RobotInput, token: string): Promise<Robot> {
  return toRobot(await patchRobot(id, input, token))
}

/** DELETE /robots/:id (JWT). Refused by the API while any match uses the robot. */
export async function deleteRobot(id: string, token: string): Promise<void> {
  return removeRobot(id, token)
}

function toMatchSummary(api: ApiMatch): MatchSummary {
  return {
    id: api.id,
    championshipId: api.championshipId,
    weightClass: api.weightClass,
    robotAId: api.robotAId,
    robotBId: api.robotBId,
    state: api.state,
    scheduledAt: api.scheduledAt,
    createdAt: api.createdAt,
    modifiedAt: api.modifiedAt,
  }
}

/** GET /matches of a championship for the organizer screens */
export async function getMatchSummaries(championshipId: string): Promise<MatchSummary[]> {
  return (await listMatches(championshipId)).map(toMatchSummary)
}

/** Form payload for create and update */
export interface MatchInput {
  robotAId: string
  robotBId: string
  /** ISO timestamp */
  scheduledAt: string
}

/** POST /matches (JWT) */
export async function createMatch(
  championshipId: string,
  input: MatchInput,
  token: string,
): Promise<MatchSummary> {
  return toMatchSummary(await postMatch({ ...input, championshipId }, token))
}

/** PATCH /matches/:id (JWT). Only scheduled matches. */
export async function updateMatch(
  id: string,
  input: MatchInput,
  token: string,
): Promise<MatchSummary> {
  return toMatchSummary(await patchMatch(id, input, token))
}

/** DELETE /matches/:id (JWT). Only scheduled matches. */
export async function deleteMatch(id: string, token: string): Promise<void> {
  return removeMatch(id, token)
}

// apps/api has no arenas, operator match data or referee access yet. These reject with a clear
// error instead of inventing endpoints; replace each with a request once the API provides it.
const notImplemented = () => new ApiError(501, 'not_implemented', ['not_implemented'])

/** Arenas are global, one ESP32 box each. No API yet. */
export const getArenas: (championshipId: string) => Promise<Arena[]> = async () => {
  throw notImplemented()
}

/** A match with its operator data (fights, end reason). The API only has `MatchSummary`. */
export const getMatch: (id: string) => Promise<Match | null> = async () => {
  throw notImplemented()
}

/** A referee's link, without an account. No API yet. */
export const getRefereeAccess: (token: string) => Promise<RefereeAccess | null> = async () => {
  throw notImplemented()
}
