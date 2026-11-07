// Pure logic for ArenasView. Name validation mirrors `ArenaNameDto` (apps/api): normalized, then
// 1-40 characters.
import { ApiError } from '@/api/client'
import type { ManagedArena } from '@/types'
import { normalizeText } from '@/utils/robot'

export const ARENA_NAME_MAX_LENGTH = 40

export const ARENA_MESSAGES = {
  nameRequired: 'Informe o nome da arena.',
  nameTooLong: `Use no máximo ${ARENA_NAME_MAX_LENGTH} caracteres.`,
  nameTaken: 'Você já tem uma arena com esse nome.',
  nameInvalid: 'Nome inválido.',
  matchLive: 'Esta arena está com uma luta em andamento. Tente de novo quando ela terminar.',
  notFound: 'Esta arena não existe mais.',
  noConnection: 'Não foi possível conectar ao servidor. Tente novamente.',
  generic: 'Não foi possível concluir a ação. Tente novamente.',
} as const

/** The normalized name, or the message to show under the field */
export function validateArenaName(value: string): { name: string; error?: string } {
  const name = normalizeText(value)
  if (!name) return { name, error: ARENA_MESSAGES.nameRequired }
  if (name.length > ARENA_NAME_MAX_LENGTH) return { name, error: ARENA_MESSAGES.nameTooLong }
  return { name }
}

/** `deviceId · rodando A × B` while a match is set, else just the device id */
export function arenaSubtitle(arena: ManagedArena): string {
  const match = arena.currentMatch
  return match
    ? `${arena.deviceId} · rodando ${match.robotAName} × ${match.robotBName}`
    : arena.deviceId
}

export type ArenaErrorKind = 'name' | 'general'

/** Maps an API failure to a message, and says whether it belongs under the name field */
export function describeArenaError(error: unknown): { kind: ArenaErrorKind; message: string } {
  if (error instanceof ApiError) {
    if (error.status === 0) return { kind: 'general', message: ARENA_MESSAGES.noConnection }
    if (error.details.includes('arena_name_taken')) {
      return { kind: 'name', message: ARENA_MESSAGES.nameTaken }
    }
    if (error.details.includes('arena_match_live')) {
      return { kind: 'general', message: ARENA_MESSAGES.matchLive }
    }
    if (error.status === 404) return { kind: 'general', message: ARENA_MESSAGES.notFound }
    if (error.status === 400 && error.details.some((d) => /^name\b/.test(d))) {
      return { kind: 'name', message: ARENA_MESSAGES.nameInvalid }
    }
  }
  return { kind: 'general', message: ARENA_MESSAGES.generic }
}
