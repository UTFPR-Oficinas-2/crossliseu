// Match display helpers shared by the organizer match list, the form and the public pages
import type { MatchEndReason, MatchState, Side } from '@/types'

/** PROGRAMADA blue, EM ANDAMENTO orange, PAUSADA amber, ENCERRADA green */
export const matchStatePill: Record<
  MatchState,
  { label: string; tone: 'info' | 'accent' | 'warning' | 'success' }
> = {
  scheduled: { label: 'Programada', tone: 'info' },
  ongoing: { label: 'Em andamento', tone: 'accent' },
  paused: { label: 'Pausada', tone: 'warning' },
  finished: { label: 'Encerrada', tone: 'success' },
}

/**
 * "Tempo esgotado", "Encerrada pelo operador" or "Desistência do lado X", where X is the side
 * that gave up (the API's `surrenderedRobotId`); just "Desistência" when that side is unknown.
 */
export function endReasonLabel(reason: MatchEndReason, surrenderedSide: Side | null): string {
  if (reason === 'time_out') return 'Tempo esgotado'
  if (reason === 'manual') return 'Encerrada pelo operador'
  return surrenderedSide ? `Desistência do lado ${surrenderedSide}` : 'Desistência'
}
