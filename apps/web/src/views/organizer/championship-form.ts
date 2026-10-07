// Pure logic for ChampionshipFormView: validation mirrors `CreateChampionshipDto` and
// `ChampionshipsService.assertValidDateRange` in apps/api, so the API never rejects what the
// form accepts.
import { ApiError } from '@/api/client'
import type { ChampionshipInput } from '@/mocks'
import type { Championship } from '@/types'

export interface ChampionshipFormValues {
  name: string
  /** `YYYY-MM-DD`, as a native date input gives it */
  startDate: string
  endDate: string
}
export type ChampionshipFormField = keyof ChampionshipFormValues
export type ChampionshipFormErrors = Partial<Record<ChampionshipFormField, string>>

export const FORM_MESSAGES = {
  nameRequired: 'Informe o nome do campeonato.',
  startRequired: 'Informe a data de início.',
  endRequired: 'Informe a data de término.',
  endBeforeStart: 'A data de término não pode ser anterior à data de início.',
  nameInvalid: 'Nome inválido.',
  startInvalid: 'Data de início inválida.',
  endInvalid: 'Data de término inválida.',
  noConnection: 'Não foi possível conectar ao servidor. Tente novamente.',
  reviewFields: 'Revise os campos destacados.',
  generic: 'Não foi possível salvar o campeonato. Tente novamente.',
} as const

export const emptyFormValues = (): ChampionshipFormValues => ({
  name: '',
  startDate: '',
  endDate: '',
})

/** API dates are timestamps at UTC midnight; a date input wants the `YYYY-MM-DD` part */
export function formValuesFrom(championship: Championship): ChampionshipFormValues {
  return {
    name: championship.name,
    startDate: championship.startDate?.slice(0, 10) ?? '',
    endDate: championship.endDate?.slice(0, 10) ?? '',
  }
}

export function validateChampionshipForm(values: ChampionshipFormValues): ChampionshipFormErrors {
  const errors: ChampionshipFormErrors = {}
  if (!values.name.trim()) errors.name = FORM_MESSAGES.nameRequired
  if (!values.startDate) errors.startDate = FORM_MESSAGES.startRequired
  if (!values.endDate) errors.endDate = FORM_MESSAGES.endRequired
  // ISO dates compare correctly as strings
  else if (values.startDate && values.endDate < values.startDate) {
    errors.endDate = FORM_MESSAGES.endBeforeStart
  }
  return errors
}

export function toChampionshipInput(values: ChampionshipFormValues): ChampionshipInput {
  return { name: values.name.trim(), startDate: values.startDate, endDate: values.endDate }
}

// class-validator messages start with the property name ("name should not be empty")
const apiFieldMessages: [RegExp, ChampionshipFormField, string][] = [
  [/^championship_end_before_start$/, 'endDate', FORM_MESSAGES.endBeforeStart],
  [/^name\b/, 'name', FORM_MESSAGES.nameInvalid],
  [/^startDate\b/, 'startDate', FORM_MESSAGES.startInvalid],
  [/^endDate\b/, 'endDate', FORM_MESSAGES.endInvalid],
]

export function describeSaveError(error: unknown): {
  message: string
  fields: ChampionshipFormErrors
} {
  if (error instanceof ApiError) {
    if (error.status === 0) return { message: FORM_MESSAGES.noConnection, fields: {} }
    if (error.status === 400) {
      const fields: ChampionshipFormErrors = {}
      for (const detail of error.details) {
        const match = apiFieldMessages.find(([pattern]) => pattern.test(detail))
        if (match && !fields[match[1]]) fields[match[1]] = match[2]
      }
      if (Object.keys(fields).length > 0) return { message: FORM_MESSAGES.reviewFields, fields }
    }
  }
  return { message: FORM_MESSAGES.generic, fields: {} }
}
