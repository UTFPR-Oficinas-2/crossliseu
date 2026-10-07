// Championship display helpers shared by the organizer pages and the demo data layer.
import type { Championship, ChampionshipStatus } from '@/types'

/** Calendar day (UTC) of an ISO date or timestamp, as `YYYY-MM-DD` */
const utcDay = (value: string | Date) =>
  (typeof value === 'string' ? new Date(value) : value).toISOString().slice(0, 10)

/**
 * Mirrors `Championship.setInitialStatus` in apps/api (UTC calendar days, both ends inclusive).
 * API rows carry their own `status`; this is only for championships written in demo mode.
 */
export function championshipStatusFromDates(
  startDate: string,
  endDate: string,
  now: Date = new Date(),
): ChampionshipStatus {
  const today = utcDay(now)
  if (utcDay(endDate) < today) return 'finished'
  if (utcDay(startDate) > today) return 'scheduled'
  return 'running'
}

/** Figma 06: EM ANDAMENTO orange, PROGRAMADO blue, ENCERRADO muted */
export const championshipStatusPill: Record<
  ChampionshipStatus,
  { label: string; tone: 'accent' | 'info' | 'neutral' }
> = {
  running: { label: 'Em andamento', tone: 'accent' },
  scheduled: { label: 'Programado', tone: 'info' },
  finished: { label: 'Encerrado', tone: 'neutral' },
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

/** Row meta line with only what the API returns: "10 dez 2025 · 16 robôs · 15 de 15 lutas" */
export function championshipMeta(
  championship: Pick<
    Championship,
    'startDate' | 'endDate' | 'robotCount' | 'fightsDone' | 'fightsTotal'
  >,
): string {
  const { startDate, endDate, robotCount, fightsDone, fightsTotal } = championship
  const segments: string[] = []
  if (startDate) segments.push(formatDateRange(startDate, endDate))
  if (robotCount !== undefined) {
    segments.push(`${numberFormat.format(robotCount)} ${robotCount === 1 ? 'robô' : 'robôs'}`)
  }
  if (fightsTotal !== undefined && fightsTotal > 0 && fightsDone !== undefined) {
    segments.push(
      `${numberFormat.format(fightsDone)} de ${numberFormat.format(fightsTotal)} ${fightsTotal === 1 ? 'luta' : 'lutas'}`,
    )
  }
  return segments.join(' · ')
}
