// Pure logic for MatchesView (Figma 10)
import type { MatchState, MatchSummary, Robot } from '@/types'

export type MatchFilter = 'all' | 'waiting' | 'running' | 'finished'

export const MATCH_FILTERS: { value: MatchFilter; label: string; empty: string }[] = [
  { value: 'all', label: 'Todas', empty: 'Nenhuma luta ainda.' },
  { value: 'waiting', label: 'Programadas', empty: 'Nenhuma luta programada.' },
  { value: 'running', label: 'Em andamento', empty: 'Nenhuma luta em andamento.' },
  { value: 'finished', label: 'Encerradas', empty: 'Nenhuma luta encerrada.' },
]

/** The `?state=` query value; anything unknown falls back to "Todas" */
export function matchFilterFrom(value: unknown): MatchFilter {
  return value === 'waiting' || value === 'running' || value === 'finished' ? value : 'all'
}

/** "Em andamento" covers running and paused fights */
export function inMatchFilter(state: MatchState, filter: MatchFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'running') return state === 'running' || state === 'paused'
  return state === filter
}

const numberFormat = new Intl.NumberFormat('pt-BR')

/** "15 lutas · montadas manualmente, sem chaveamento automático." */
export function matchesSubtitle(count: number): string {
  const lutas = `${numberFormat.format(count)} ${count === 1 ? 'luta' : 'lutas'}`
  return `${lutas} · montadas manualmente, sem chaveamento automático.`
}

export interface MatchRow {
  match: MatchSummary
  robotA: string
  robotB: string
}

/** Robot names for each match. A robot missing from the list shows as "Robô removido". */
export function matchRows(matches: MatchSummary[], robots: Robot[]): MatchRow[] {
  const names = new Map(robots.map((robot) => [robot.id, robot.name]))
  return matches.map((match) => ({
    match,
    robotA: names.get(match.robotAId) ?? 'Robô removido',
    robotB: names.get(match.robotBId) ?? 'Robô removido',
  }))
}
