// Pure logic for ParticipantsView (Figma 09)
import { ApiError } from '@/api/client'
import type { Robot } from '@/types'

const numberFormat = new Intl.NumberFormat('pt-BR')

const count = (value: number, one: string, many: string) =>
  `${numberFormat.format(value)} ${value === 1 ? one : many}`

/** "16 robôs inscritos · 9 equipes". Teams are counted ignoring case. */
export function participantsSubtitle(robots: Robot[]): string {
  const teams = new Set(robots.map((r) => r.team.toLocaleLowerCase('pt-BR')))
  return `${count(robots.length, 'robô inscrito', 'robôs inscritos')} · ${count(teams.size, 'equipe', 'equipes')}`
}

// Lowercase without accents, so "aco" finds "Aço"
const fold = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR')

/** "Buscar robô ou equipe": matches the robot name or the team, ignoring case and accents */
export function filterRobots(robots: Robot[], query: string): Robot[] {
  const needle = fold(query.trim())
  if (!needle) return robots
  return robots.filter((r) => fold(r.name).includes(needle) || fold(r.team).includes(needle))
}

export const REMOVE_MESSAGES = {
  hasMatches: (name: string) =>
    `Não foi possível remover ${name}: o robô está em lutas do campeonato.`,
  noConnection: 'Não foi possível conectar ao servidor. Tente novamente.',
  generic: (name: string) => `Não foi possível remover ${name}. Tente novamente.`,
}

/** Inline message after "Remover" fails */
export function describeRemoveError(error: unknown, robotName: string): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return REMOVE_MESSAGES.noConnection
    if (error.details.includes('robot_has_matches')) return REMOVE_MESSAGES.hasMatches(robotName)
  }
  return REMOVE_MESSAGES.generic(robotName)
}
