// Championship display helpers shared by the organizer pages.
import type { Championship, ChampionshipStatus } from '@/types'

/** Figma 06: EM ANDAMENTO orange, PROGRAMADO blue, ENCERRADO muted */
export const championshipStatusPill: Record<
  ChampionshipStatus,
  { label: string; tone: 'accent' | 'info' | 'neutral' }
> = {
  ongoing: { label: 'Em andamento', tone: 'accent' },
  scheduled: { label: 'Programado', tone: 'info' },
  closed: { label: 'Encerrado', tone: 'neutral' },
}

const dayMonthYear = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

function dateParts(value: string) {
  const parts = dayMonthYear.formatToParts(new Date(value))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return { day: get('day'), month: get('month').replace('.', ''), year: get('year') }
}

/** "09 dez 2026", "19 – 20 dez 2026", "28 nov – 02 dez 2026", "30 dez 2026 – 02 jan 2027" */
export function formatDateRange(startDate: string, endDate?: string | null): string {
  const start = dateParts(startDate)
  const single = `${start.day} ${start.month} ${start.year}`
  if (!endDate) return single
  const end = dateParts(endDate)
  if (start.year !== end.year) return `${single} – ${end.day} ${end.month} ${end.year}`
  if (start.month !== end.month) {
    return `${start.day} ${start.month} – ${end.day} ${end.month} ${end.year}`
  }
  if (start.day !== end.day) return `${start.day} – ${end.day} ${end.month} ${end.year}`
  return single
}

const numberFormat = new Intl.NumberFormat('pt-BR')

/**
 * Row meta line with only what the API returns: "10 dez 2025 · 16 robôs", plus
 * "· 15 de 15 lutas" once the championship is closed (Figma ORG-01)
 */
export function championshipMeta(
  championship: Pick<
    Championship,
    'status' | 'startDate' | 'endDate' | 'robotCount' | 'fightsDone' | 'fightsTotal'
  >,
): string {
  const { status, startDate, endDate, robotCount, fightsDone, fightsTotal } = championship
  const segments: string[] = []
  if (startDate) segments.push(formatDateRange(startDate, endDate))
  if (robotCount !== undefined) {
    segments.push(`${numberFormat.format(robotCount)} ${robotCount === 1 ? 'robô' : 'robôs'}`)
  }
  if (
    status === 'closed' &&
    fightsTotal !== undefined &&
    fightsTotal > 0 &&
    fightsDone !== undefined
  ) {
    segments.push(
      `${numberFormat.format(fightsDone)} de ${numberFormat.format(fightsTotal)} ${fightsTotal === 1 ? 'luta' : 'lutas'}`,
    )
  }
  return segments.join(' · ')
}
