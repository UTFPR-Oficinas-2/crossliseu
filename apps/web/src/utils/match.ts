// Match display helpers shared by the organizer match list and form
import type { MatchState } from '@/types'

/** Figma 10: PROGRAMADA blue, EM ANDAMENTO orange (running or paused), ENCERRADA green */
export const matchStatePill: Record<
  MatchState,
  { label: string; tone: 'info' | 'accent' | 'success' }
> = {
  waiting: { label: 'Programada', tone: 'info' },
  running: { label: 'Em andamento', tone: 'accent' },
  paused: { label: 'Em andamento', tone: 'accent' },
  finished: { label: 'Encerrada', tone: 'success' },
}
