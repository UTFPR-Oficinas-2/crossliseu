// Data access for pages. Every function is async so it can call the API later without changing
// call sites. Missing ids resolve to `null`. Functions backed by apps/api switch to it when
// `VITE_API_URL` is set; the rest still serve demo data.
import { isApiEnabled } from '@/api/client'
import { listChampionships, type ApiChampionship } from '@/api/championships'
import type {
  Arena,
  Championship,
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

/** Only the fields apps/api returns; everything else stays undefined (see `Championship`). */
function toChampionship(api: ApiChampionship): Championship {
  return {
    id: api.id,
    name: api.name,
    startDate: api.scheduledDate,
    createdAt: api.createdAt,
    modifiedAt: api.modifiedAt,
  }
}

/** GET /championships when the API is configured. Errors propagate to the caller. */
export async function getChampionships(): Promise<Championship[]> {
  if (isApiEnabled) return (await listChampionships()).map(toChampionship)
  return (await demo()).championships
}

export async function getChampionship(id: string): Promise<Championship | null> {
  const { championships } = await demo()
  return championships.find((c) => c.id === id) ?? null
}

/** Championships the signed-in organizer can manage */
export async function getManagedChampionships(): Promise<Championship[]> {
  const { championships, managedChampionshipIds } = await demo()
  return championships.filter((c) => managedChampionshipIds.includes(c.id))
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
