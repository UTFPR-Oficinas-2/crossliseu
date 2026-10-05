// Data access for pages. Every function is async so it can call the API later without changing
// call sites. Missing ids resolve to `null`. Functions backed by apps/api switch to it when
// `VITE_API_URL` is set (championship reads and writes, sign-in); the rest still serve demo data.
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
import { championshipStatusFromDates } from '@/utils/championship'
import type {
  Arena,
  Championship,
  ChampionshipStatus,
  Match,
  MatchState,
  RefereeAccess,
  RefereeScore,
  Robot,
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
    // `crypto.randomUUID` only exists in secure contexts (not on a plain-http LAN origin)
    id: crypto.randomUUID?.() ?? `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

export async function getRobots(championshipId: string): Promise<Robot[]> {
  const { robots } = await demo()
  return robots.filter((r) => r.championshipId === championshipId)
}

/** Matches in their manual fight order */
export async function getMatches(championshipId: string): Promise<Match[]> {
  const { matches } = await demo()
  return matches
    .filter((m) => m.championshipId === championshipId)
    .sort((a, b) => a.order - b.order)
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
