// Pure rules for ArenaFightPickView: which fights can be picked for an arena, how an arena's
// connection reads, and what to say when the API refuses the pick.
import { ApiError } from '@/api/client'
import type { StatusTone } from '@/components/ui/status-pill'
import type { Arena, MatchSummary, Robot } from '@/types'
import { matchRows } from '@/views/organizer/matches-list'

/** Offline arenas are marked, never blocked: the server owns the fight */
export function arenaStatusPill(arena: Arena): { label: string; tone: StatusTone } {
  return arena.online
    ? { label: 'Conectada', tone: 'success' }
    : { label: 'Desconectada', tone: 'danger' }
}

export interface FightOption {
  match: MatchSummary
  robotA: string
  robotB: string
  /** The arena whose current match this fight already is */
  heldBy: Arena | null
}

/** The championship's scheduled fights, earliest first */
export function fightOptions(
  matches: MatchSummary[],
  robots: Robot[],
  arenas: Arena[],
): FightOption[] {
  const scheduled = matches
    .filter((m) => m.state === 'scheduled')
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
  return matchRows(scheduled, robots).map(({ match, robotA, robotB }) => ({
    match,
    robotA,
    robotB,
    heldBy: arenas.find((a) => a.currentMatchId === match.id) ?? null,
  }))
}

/** A fight already current on another arena can't be picked (409 `match_already_current`) */
export function fightDisabled(option: FightOption, selectedArenaId: string | null): boolean {
  return option.heldBy !== null && option.heldBy.id !== selectedArenaId
}

const NOT_FOUND = 'Arena ou luta não encontrada. Atualize a página.'

const PICK_ERRORS: Record<string, string> = {
  arena_match_started: 'Esta arena já tem uma luta iniciada. Retome-a ou encerre-a antes.',
  match_already_current: 'Esta luta já está aberta em outra arena.',
  match_not_scheduled: 'Esta luta não está mais programada.',
  arena_not_found: NOT_FOUND,
  match_not_found: NOT_FOUND,
}

/** Message for a refused PUT /arenas/:id/current-match */
export function pickErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.details.find((d) => Object.hasOwn(PICK_ERRORS, d))
    if (code) return PICK_ERRORS[code]!
  }
  return 'Não foi possível abrir a luta. Tente novamente.'
}
