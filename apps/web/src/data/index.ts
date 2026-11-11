// Data access for pages. Every function is async and talks to apps/api through `@/api/*`; the
// mappers turn API payloads into the `@/types` the screens use. There is no demo data: a page
// whose backend does not exist yet gets a rejected `ApiError` (see `notImplemented`).
import { ApiError } from '@/api/client'
import {
  createChampionship as postChampionship,
  getChampionship as fetchChampionship,
  listChampionships,
  listMyChampionships,
  updateChampionship as patchChampionship,
  type ApiChampionship,
} from '@/api/championships'
import {
  createArena,
  deleteArena,
  listArenas,
  renameArena as patchArena,
  rotateArenaToken,
  setArenaCurrentMatch,
  type ApiArena,
} from '@/api/arenas'
import { login } from '@/api/auth'
import {
  createMatch as postMatch,
  deleteMatch as removeMatch,
  getMatchById,
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
  DeviceCredentials,
  ManagedArena,
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

/** GET /championships/mine (JWT): the championships the signed-in account owns */
export async function getManagedChampionships(token: string): Promise<Championship[]> {
  return (await listMyChampionships(token)).map(toChampionship)
}

/** Whether the signed-in account owns the championship. Unknown or malformed ids are not owned. */
export async function ownsChampionship(championshipId: string, token: string): Promise<boolean> {
  return (await listMyChampionships(token)).some((c) => c.id === championshipId)
}

/** Championship of a match (GET /matches/:id). Unknown or malformed ids resolve to `null`. */
export async function matchChampionshipId(matchId: string): Promise<string | null> {
  try {
    return (await getMatchById(matchId)).championshipId
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null
    throw error
  }
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
    arenaId: api.arenaId,
    state: api.state,
    scheduledAt: api.scheduledAt,
    createdAt: api.createdAt,
    modifiedAt: api.modifiedAt,
  }
}

/** GET /matches/:id. Unknown or malformed ids resolve to `null`. */
export async function getMatchSummary(id: string): Promise<MatchSummary | null> {
  try {
    return toMatchSummary(await getMatchById(id))
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null
    throw error
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

// apps/api has no operator match data or referee access yet. These reject with a clear
// error instead of inventing endpoints; replace each with a request once the API provides it.
const notImplemented = () => new ApiError(501, 'not_implemented', ['not_implemented'])

// Shared by both arena views; the match id already comes as `currentMatchId`
function toCurrentMatch(api: ApiArena): Arena['currentMatch'] {
  return (
    api.currentMatch && {
      robotAName: api.currentMatch.robotAName,
      robotBName: api.currentMatch.robotBName,
    }
  )
}

function toManagedArena(api: ApiArena): ManagedArena {
  return {
    id: api.id,
    name: api.name,
    deviceId: api.deviceId,
    currentMatch: toCurrentMatch(api),
  }
}

/** GET /arenas (JWT). The account's own arenas. */
export async function getMyArenas(token: string): Promise<ManagedArena[]> {
  return (await listArenas(token)).map(toManagedArena)
}

/** POST /arenas (JWT). The credentials (with the plain token) come only in this response. */
export async function addArena(
  name: string,
  token: string,
): Promise<{ arena: ManagedArena; credentials: DeviceCredentials }> {
  const { arena, credentials } = await createArena(name, token)
  return { arena: toManagedArena(arena), credentials }
}

/** PATCH /arenas/:id (JWT). The device id does not change. */
export async function renameArena(id: string, name: string, token: string): Promise<ManagedArena> {
  return toManagedArena(await patchArena(id, name, token))
}

/** POST /arenas/:id/token (JWT). The old token stops working; refused while a match is live. */
export async function newArenaToken(id: string, token: string): Promise<DeviceCredentials> {
  return rotateArenaToken(id, token)
}

/** DELETE /arenas/:id (JWT). Refused while a match is live. */
export async function removeArena(id: string, token: string): Promise<void> {
  return deleteArena(id, token)
}

function toArena(api: ApiArena): Arena {
  return {
    id: api.id,
    name: api.name,
    online: api.online,
    currentMatchId: api.currentMatchId,
    currentMatch: toCurrentMatch(api),
  }
}

/** GET /arenas (JWT). The account's arenas for the operator: online flag and current match. */
export async function getArenas(token: string): Promise<Arena[]> {
  return (await listArenas(token)).map(toArena)
}

/** PUT /arenas/:id/current-match (JWT). The operator's pick; refusals come through as ApiError. */
export async function selectArenaMatch(
  arenaId: string,
  matchId: string,
  token: string,
): Promise<Arena> {
  return toArena(await setArenaCurrentMatch(arenaId, matchId, token))
}

/** A match with its operator data (fights, end reason). The API only has `MatchSummary`. */
export const getMatch: (id: string) => Promise<Match | null> = async () => {
  throw notImplemented()
}

/** A referee's link, without an account. No API yet. */
export const getRefereeAccess: (token: string) => Promise<RefereeAccess | null> = async () => {
  throw notImplemented()
}

// ---------- fight recording upload (#20) ----------
// apps/api has no recording routes yet (#45). The calls are ready in `@/api/recordings`
// (`requestUploadUrl`, `markUploaded`, see docs/recording-storage.md); once the routes land,
// these two functions return those calls instead of rejecting.

/** Where to PUT the video: a presigned R2 URL and the object key it creates */
export interface RecordingUploadTarget {
  url: string
  key: string
}

/** Step 1 of the upload: POST /matches/:id/recording/upload-url (JWT). No API yet. */
export const requestRecordingUpload: (
  matchId: string,
  contentType: string,
  token: string,
) => Promise<RecordingUploadTarget> = async () => {
  throw notImplemented()
}

/** Step 3 of the upload: POST /matches/:id/recording/complete (JWT). No API yet. */
export const confirmRecordingUpload: (
  matchId: string,
  upload: { key: string; size: number },
  token: string,
) => Promise<void> = async () => {
  throw notImplemented()
}
