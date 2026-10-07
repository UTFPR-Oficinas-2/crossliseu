// Data access for pages. Every function is async so it can call the API later without changing
// call sites. Missing ids resolve to `null`. Functions backed by apps/api switch to it when
// `VITE_API_URL` is set (championships, robots, match scheduling, sign-in); the rest still serve
// demo data.
import { ApiError, isApiEnabled } from '@/api/client'
import {
  createChampionship as postChampionship,
  getChampionship as fetchChampionship,
  listChampionships,
  updateChampionship as patchChampionship,
  type ApiChampionship,
  type ApiChampionshipStatus,
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
import { championshipStatusFromDates } from '@/utils/championship'
import { normalizeText } from '@/utils/robot'
import type {
  Arena,
  Championship,
  ChampionshipStatus,
  Match,
  MatchState,
  MatchSummary,
  RefereeAccess,
  RefereeScore,
  Robot,
  WeightClass,
} from '@/types'

// Demo data is dev-only. `import.meta.env.DEV` is replaced at build time, so production bundles
// don't contain (or emit a chunk for) `./data`; production only takes the API branches above.
const demo = () =>
  import.meta.env.DEV
    ? import('./data')
    : Promise.reject(new Error('Demo data is not available in production builds'))

const demoAuth = () =>
  import.meta.env.DEV
    ? import('./demo-auth')
    : Promise.reject(new Error('Demo sign-in is not available in production builds'))

const championshipStatus: Record<ApiChampionshipStatus, ChampionshipStatus> = {
  ongoing: 'running',
  scheduled: 'scheduled',
  closed: 'finished',
}

function toChampionship(api: ApiChampionship): Championship {
  return {
    id: api.id,
    name: api.name,
    startDate: api.startDate,
    endDate: api.endDate,
    status: championshipStatus[api.status],
    robotCount: api.robotCount,
    fightsDone: api.fightsDone,
    fightsTotal: api.fightsTotal,
    createdAt: api.createdAt,
    modifiedAt: api.modifiedAt,
  }
}

/** GET /championships when the API is configured. Errors propagate to the caller. */
export async function getChampionships(): Promise<Championship[]> {
  if (isApiEnabled) return (await listChampionships()).map(toChampionship)
  return (await demo()).championships
}

/**
 * POST /auth/login when the API is configured, otherwise the demo account
 * (`organizador` / `crossliseu`). Resolves to the JWT; wrong credentials throw `ApiError(401)`.
 */
export async function signIn(username: string, password: string): Promise<string> {
  if (isApiEnabled) return (await login(username, password)).token
  return (await demoAuth()).demoSignIn(username, password)
}

/** Form payload for create and update; dates are `YYYY-MM-DD` (`CreateChampionshipDto`) */
export interface ChampionshipInput {
  name: string
  startDate: string
  endDate: string
}

/** GET /championships/:id when the API is configured. Unknown or malformed ids resolve to `null`. */
export async function getChampionship(id: string): Promise<Championship | null> {
  if (isApiEnabled) {
    try {
      return toChampionship(await fetchChampionship(id))
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null
      throw error
    }
  }
  const { championships } = await demo()
  return championships.find((c) => c.id === id) ?? null
}

/**
 * Championships the signed-in organizer can manage. The API has no roles yet, so with the API
 * configured this is every championship.
 */
export async function getManagedChampionships(): Promise<Championship[]> {
  if (isApiEnabled) return (await listChampionships()).map(toChampionship)
  const { championships, managedChampionshipIds } = await demo()
  return championships.filter((c) => managedChampionshipIds.includes(c.id))
}

// `crypto.randomUUID` only exists in secure contexts (not on a plain-http LAN origin)
const newDemoId = () =>
  crypto.randomUUID?.() ?? `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`

const demoError = (status: number, code: string) => new ApiError(status, code, [code])

// Same rule and code as `ChampionshipsService.assertValidDateRange`
function assertDemoDateRange({ startDate, endDate }: ChampionshipInput) {
  if (endDate < startDate) {
    throw new ApiError(400, 'championship_end_before_start', ['championship_end_before_start'])
  }
}

/** POST /championships (JWT). In demo mode the championship is added to the in-memory list. */
export async function createChampionship(
  input: ChampionshipInput,
  token: string,
): Promise<Championship> {
  if (isApiEnabled) return toChampionship(await postChampionship(input, token))
  assertDemoDateRange(input)
  const { championships, managedChampionshipIds } = await demo()
  const now = new Date().toISOString()
  const championship: Championship = {
    id: newDemoId(),
    ...input,
    status: championshipStatusFromDates(input.startDate, input.endDate),
    robotCount: 0,
    fightsDone: 0,
    fightsTotal: 0,
    createdAt: now,
    modifiedAt: now,
  }
  championships.push(championship)
  managedChampionshipIds.push(championship.id)
  return { ...championship }
}

/** PATCH /championships/:id (JWT). In demo mode the in-memory championship is updated. */
export async function updateChampionship(
  id: string,
  input: ChampionshipInput,
  token: string,
): Promise<Championship> {
  if (isApiEnabled) return toChampionship(await patchChampionship(id, input, token))
  assertDemoDateRange(input)
  const { championships } = await demo()
  const championship = championships.find((c) => c.id === id)
  if (!championship) throw new ApiError(404, 'championship_not_found', ['championship_not_found'])
  Object.assign(championship, input, {
    status: championshipStatusFromDates(input.startDate, input.endDate),
    modifiedAt: new Date().toISOString(),
  })
  return { ...championship }
}

export async function getArenas(championshipId: string): Promise<Arena[]> {
  const { arenas } = await demo()
  return arenas.filter((a) => a.championshipId === championshipId)
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

/** Robots of a championship in registration order. GET /robots when the API is configured. */
export async function getRobots(championshipId: string): Promise<Robot[]> {
  if (isApiEnabled) return (await listRobots(championshipId)).map(toRobot)
  const { robots } = await demo()
  return robots.filter((r) => r.championshipId === championshipId)
}

/** Form payload for create and update (`CreateRobotDto` without the championship) */
export interface RobotInput {
  name: string
  team: string
  weightClass: WeightClass
}

// Same normalization as the API DTO: `@NormalizeText` on name and team; the weight class is exact
function normalizeRobotInput(input: RobotInput): RobotInput {
  return {
    name: normalizeText(input.name),
    team: normalizeText(input.team),
    weightClass: input.weightClass,
  }
}

// Same rules and codes as `RobotsService` in apps/api
function assertDemoNameAvailable(
  robots: Robot[],
  championshipId: string,
  name: string,
  robotId?: string,
) {
  const lower = name.toLocaleLowerCase('pt-BR')
  const taken = robots.some(
    (r) =>
      r.championshipId === championshipId &&
      r.id !== robotId &&
      r.name.toLocaleLowerCase('pt-BR') === lower,
  )
  if (taken) throw demoError(409, 'robot_name_taken')
}

const demoRobotHasMatches = (matches: Match[], robotId: string) =>
  matches.some((m) => m.robotAId === robotId || m.robotBId === robotId)

/** POST /robots (JWT). In demo mode the robot is added to the in-memory list. */
export async function createRobot(
  championshipId: string,
  input: RobotInput,
  token: string,
): Promise<Robot> {
  if (isApiEnabled) return toRobot(await postRobot({ ...input, championshipId }, token))
  const { championships, robots } = await demo()
  if (!championships.some((c) => c.id === championshipId)) {
    throw demoError(404, 'championship_not_found')
  }
  const normalized = normalizeRobotInput(input)
  assertDemoNameAvailable(robots, championshipId, normalized.name)
  const now = new Date().toISOString()
  const robot: Robot = {
    id: newDemoId(),
    championshipId,
    ...normalized,
    createdAt: now,
    modifiedAt: now,
  }
  robots.push(robot)
  return { ...robot }
}

/** PATCH /robots/:id (JWT). In demo mode the in-memory robot is updated. */
export async function updateRobot(id: string, input: RobotInput, token: string): Promise<Robot> {
  if (isApiEnabled) return toRobot(await patchRobot(id, input, token))
  const { robots, matches } = await demo()
  const robot = robots.find((r) => r.id === id)
  if (!robot) throw demoError(404, 'robot_not_found')
  const normalized = normalizeRobotInput(input)
  assertDemoNameAvailable(robots, robot.championshipId, normalized.name, id)
  if (normalized.weightClass !== robot.weightClass && demoRobotHasMatches(matches, id)) {
    throw demoError(409, 'robot_has_matches')
  }
  Object.assign(robot, normalized, { modifiedAt: new Date().toISOString() })
  return { ...robot }
}

/** DELETE /robots/:id (JWT). Refused while any match uses the robot. */
export async function deleteRobot(id: string, token: string): Promise<void> {
  if (isApiEnabled) return removeRobot(id, token)
  const { robots, matches } = await demo()
  const index = robots.findIndex((r) => r.id === id)
  if (index === -1) throw demoError(404, 'robot_not_found')
  if (demoRobotHasMatches(matches, id)) throw demoError(409, 'robot_has_matches')
  robots.splice(index, 1)
}

/** Matches in their manual fight order */
export async function getMatches(championshipId: string): Promise<Match[]> {
  const { matches } = await demo()
  return matches
    .filter((m) => m.championshipId === championshipId)
    .sort((a, b) => a.order - b.order)
}

function toMatchSummary(api: ApiMatch): MatchSummary {
  return {
    id: api.id,
    championshipId: api.championshipId,
    weightClass: api.weightClass,
    robotAId: api.robotAId,
    robotBId: api.robotBId,
    state: api.status,
    createdAt: api.createdAt,
    modifiedAt: api.modifiedAt,
  }
}

// Drops the operator fields of a demo `Match`
const summaryOf = (match: MatchSummary): MatchSummary => ({
  id: match.id,
  championshipId: match.championshipId,
  weightClass: match.weightClass,
  robotAId: match.robotAId,
  robotBId: match.robotBId,
  state: match.state,
  createdAt: match.createdAt,
  modifiedAt: match.modifiedAt,
})

/** Matches of a championship for the organizer screens. GET /matches when the API is configured. */
export async function getMatchSummaries(championshipId: string): Promise<MatchSummary[]> {
  if (isApiEnabled) return (await listMatches(championshipId)).map(toMatchSummary)
  return (await getMatches(championshipId)).map(summaryOf)
}

/** Form payload for create and update */
export interface MatchInput {
  robotAId: string
  robotBId: string
}

// Same checks and codes as `MatchesService.resolveRobots` in apps/api; returns the shared class
function resolveDemoRobots(robots: Robot[], championshipId: string, input: MatchInput): string {
  if (input.robotAId === input.robotBId) throw demoError(400, 'match_robots_must_differ')
  const robotA = robots.find((r) => r.id === input.robotAId)
  const robotB = robots.find((r) => r.id === input.robotBId)
  if (!robotA || !robotB) throw demoError(404, 'robot_not_found')
  if (robotA.championshipId !== championshipId || robotB.championshipId !== championshipId) {
    throw demoError(400, 'robot_not_in_championship')
  }
  if (robotA.weightClass !== robotB.weightClass) {
    throw demoError(400, 'match_weight_class_mismatch')
  }
  return robotA.weightClass
}

/** POST /matches (JWT). In demo mode the match is appended to the fight order. */
export async function createMatch(
  championshipId: string,
  input: MatchInput,
  token: string,
): Promise<MatchSummary> {
  if (isApiEnabled) return toMatchSummary(await postMatch({ ...input, championshipId }, token))
  const { championships, robots, matches, buildDemoMatch } = await demo()
  if (!championships.some((c) => c.id === championshipId)) {
    throw demoError(404, 'championship_not_found')
  }
  const weightClass = resolveDemoRobots(robots, championshipId, input)
  const number =
    Math.max(
      0,
      ...matches.filter((m) => m.championshipId === championshipId).map((m) => m.number),
    ) + 1
  const now = new Date().toISOString()
  const match = buildDemoMatch({
    ...input,
    id: newDemoId(),
    championshipId,
    number,
    order: number,
    weightClass,
    createdAt: now,
    modifiedAt: now,
  })
  matches.push(match)
  return summaryOf(match)
}

// Same guard as `MatchesService.assertEditable` in apps/api
function findEditableDemoMatch(matches: Match[], id: string): Match {
  const match = matches.find((m) => m.id === id)
  if (!match) throw demoError(404, 'match_not_found')
  if (match.state !== 'waiting') throw demoError(409, 'match_not_editable')
  return match
}

/** PATCH /matches/:id (JWT). Only waiting matches. */
export async function updateMatch(
  id: string,
  input: MatchInput,
  token: string,
): Promise<MatchSummary> {
  if (isApiEnabled) return toMatchSummary(await patchMatch(id, input, token))
  const { robots, matches } = await demo()
  const match = findEditableDemoMatch(matches, id)
  const weightClass = resolveDemoRobots(robots, match.championshipId, input)
  Object.assign(match, input, { weightClass, modifiedAt: new Date().toISOString() })
  return summaryOf(match)
}

/** DELETE /matches/:id (JWT). Only waiting matches. */
export async function deleteMatch(id: string, token: string): Promise<void> {
  if (isApiEnabled) return removeMatch(id, token)
  const { matches } = await demo()
  const match = findEditableDemoMatch(matches, id)
  matches.splice(matches.indexOf(match), 1)
}

export async function getMatch(id: string): Promise<Match | null> {
  const { matches } = await demo()
  return matches.find((m) => m.id === id) ?? null
}

/** The fight currently running or paused, if any */
export async function getLiveMatch(): Promise<Match | null> {
  const { matches } = await demo()
  return matches.find((m) => m.state === 'running' || m.state === 'paused') ?? null
}

export async function getRefereeScores(matchId: string): Promise<RefereeScore[]> {
  const { refereeScores } = await demo()
  return refereeScores.filter((s) => s.matchId === matchId).sort((a, b) => a.seat - b.seat)
}

export async function getRefereeAccess(token: string): Promise<RefereeAccess | null> {
  const { refereeAccesses } = await demo()
  return refereeAccesses.find((a) => a.token === token) ?? null
}

/** The fight shown on the home "ao vivo" strip */
export interface LiveFight {
  matchId: string
  state: Extract<MatchState, 'running' | 'paused'>
  /** Fight number ("Luta 07") */
  number: number
  /** Fights in the championship ("de 15") */
  fightsTotal: number
  championshipName: string
  arenaName: string | null
  robotAName: string
  robotBName: string
  remainingSeconds: number
}

/**
 * The fight currently running or paused, with the names the strip needs. apps/api has no
 * match state, robots or arenas yet, so this resolves to `null` when the API is configured.
 */
export async function getLiveFight(): Promise<LiveFight | null> {
  if (isApiEnabled) return null

  const match = await getLiveMatch()
  if (!match || (match.state !== 'running' && match.state !== 'paused')) return null

  const [championship, championshipRobots, championshipArenas, championshipMatches] =
    await Promise.all([
      getChampionship(match.championshipId),
      getRobots(match.championshipId),
      getArenas(match.championshipId),
      getMatches(match.championshipId),
    ])
  const robotA = championshipRobots.find((r) => r.id === match.robotAId)
  const robotB = championshipRobots.find((r) => r.id === match.robotBId)
  if (!championship || !robotA || !robotB) return null

  return {
    matchId: match.id,
    state: match.state,
    number: match.number,
    fightsTotal: championship.fightsTotal ?? championshipMatches.length,
    championshipName: championship.name,
    arenaName: championshipArenas.find((a) => a.id === match.arenaId)?.name ?? null,
    robotAName: robotA.name,
    robotBName: robotB.name,
    remainingSeconds: Math.max(0, match.roundDurationSeconds - match.elapsedSeconds),
  }
}
