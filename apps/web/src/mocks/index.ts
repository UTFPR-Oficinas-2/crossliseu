// Data access for pages. Every function is async so it can call the API later without changing
// call sites. Missing ids resolve to `null`.
import type { Arena, Championship, Match, RefereeAccess, RefereeScore, Robot } from '@/types'
import {
  arenas,
  championships,
  managedChampionshipIds,
  matches,
  refereeAccesses,
  refereeScores,
  robots,
} from './data'

export async function getChampionships(): Promise<Championship[]> {
  return championships
}

export async function getChampionship(id: string): Promise<Championship | null> {
  return championships.find((c) => c.id === id) ?? null
}

/** Championships the signed-in organizer can manage */
export async function getManagedChampionships(): Promise<Championship[]> {
  return championships.filter((c) => managedChampionshipIds.includes(c.id))
}

export async function getArenas(championshipId: string): Promise<Arena[]> {
  return arenas.filter((a) => a.championshipId === championshipId)
}

export async function getRobots(championshipId: string): Promise<Robot[]> {
  return robots.filter((r) => r.championshipId === championshipId)
}

/** Matches in their manual fight order */
export async function getMatches(championshipId: string): Promise<Match[]> {
  return matches
    .filter((m) => m.championshipId === championshipId)
    .sort((a, b) => a.order - b.order)
}

export async function getMatch(id: string): Promise<Match | null> {
  return matches.find((m) => m.id === id) ?? null
}

/** The fight currently running or paused, if any */
export async function getLiveMatch(): Promise<Match | null> {
  return matches.find((m) => m.state === 'running' || m.state === 'paused') ?? null
}

export async function getRefereeScores(matchId: string): Promise<RefereeScore[]> {
  return refereeScores.filter((s) => s.matchId === matchId).sort((a, b) => a.seat - b.seat)
}

export async function getRefereeAccess(token: string): Promise<RefereeAccess | null> {
  return refereeAccesses.find((a) => a.token === token) ?? null
}
