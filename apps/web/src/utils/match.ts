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
 * "Tempo esgotado", "Encerrada pelo operador" or "Desistência do lado X". The API stores only
 * `surrender` plus the winner, so the side that surrendered is the other one.
 */
export function endReasonLabel(reason: MatchEndReason, winnerSide: Side | null): string {
  if (reason === 'time_out') return 'Tempo esgotado'
  if (reason === 'manual' || !winnerSide) return 'Encerrada pelo operador'
  return `Desistência do lado ${winnerSide === 'A' ? 'B' : 'A'}`
}
