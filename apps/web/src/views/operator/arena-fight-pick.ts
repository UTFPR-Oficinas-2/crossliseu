// Pure rules for OperatorHomeView: which fights can be picked for an arena, how an arena's
// connection reads, and what to say when the API refuses the pick.
import { ApiError } from '@/api/client'
import type { StatusTone } from '@/components/ui/status-pill'
import type { Arena, MatchSummary, Robot } from '@/types'

const REMOVED = 'Robô removido'

export interface ArenaChoice {
  meta: string
  pill: { label: string; tone: StatusTone }
  disabled: boolean
}

/**
 * How an arena reads in the picker (Figma OPE-01). An arena with a current fight is disabled and
 * names it; offline arenas are marked but never blocked, since the server owns the fight.
 */
export function arenaChoice(arena: Arena): ArenaChoice {
  if (arena.currentMatchId) {
    const names = arena.currentMatch
      ? `${arena.currentMatch.robotAName} × ${arena.currentMatch.robotBName}`
      : 'outra luta'
    return {
      meta: `Ocupada com ${names}. Feche essa luta para liberar a arena.`,
      pill: { label: 'Em uso', tone: 'accent' },
      disabled: true,
    }
  }
  return arena.online
    ? {
        meta: 'Livre · caixa da arena conectada',
        pill: { label: 'Conectado', tone: 'success' },
        disabled: false,
      }
    : {
        meta: 'Livre · a luta pode rodar sem a caixa, mas sem botões de desistência',
        pill: { label: 'Não conectado', tone: 'danger' },
        disabled: false,
      }
}

export interface FightOption {
  match: MatchSummary
  robotA: string
  robotB: string
  teamA: string
  teamB: string
  /** The arena whose current match this fight already is */
  heldBy: Arena | null
}

/** The championship's scheduled fights, earliest first */
export function fightOptions(
  matches: MatchSummary[],
  robots: Robot[],
  arenas: Arena[],
): FightOption[] {
  const byId = new Map(robots.map((robot) => [robot.id, robot]))
  return matches
    .filter((m) => m.state === 'scheduled')
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .map((match) => {
      const a = byId.get(match.robotAId)
      const b = byId.get(match.robotBId)
      return {
        match,
        robotA: a?.name ?? REMOVED,
        robotB: b?.name ?? REMOVED,
        teamA: a?.team ?? REMOVED,
        teamB: b?.team ?? REMOVED,
        heldBy: arenas.find((arena) => arena.currentMatchId === match.id) ?? null,
      }
    })
}

/** "Equipe A × Equipe B · beetleweight", or where the fight is already open */
export function fightMeta(option: FightOption): string {
  if (option.heldBy) return `Aberta na ${option.heldBy.name}`
  return `${option.teamA} × ${option.teamB} · ${option.match.weightClass}`
}

/** Action bar text next to "Abrir luta" */
export function actionHint(arena: Arena | null): string {
  if (!arena) return 'Escolha uma arena e uma luta.'
  return `A luta fica na ${arena.name} até você fechá-la. A caixa da arena passa a mostrar os nomes e o tempo.`
}

/**
 * A fight already current on an arena can't be picked (409 `match_already_current`). That arena
 * is busy and can't be chosen either; its "Ir para a luta" link leads back to the fight.
 */
export function fightDisabled(option: FightOption): boolean {
  return option.heldBy !== null
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
