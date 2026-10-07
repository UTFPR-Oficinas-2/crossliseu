// Pure logic for ParticipantFormView (Figma 09b). Validation mirrors `CreateRobotDto` and the
// name and weight-class rules in `RobotsService` (apps/api), so the API never rejects what the
// form accepts except for conflicts it alone can see.
import { ApiError } from '@/api/client'
import type { SelectOption } from '@/components/ui/select-field'
import type { RobotInput } from '@/mocks'
import type { Robot, WeightClass } from '@/types'
import { WEIGHT_CLASSES, WEIGHT_CLASS_LABELS, isWeightClass, normalizeText } from '@/utils/robot'

export interface ParticipantFormValues {
  name: string
  team: string
  /** A `WeightClass`, or '' until one is picked */
  weightClass: string
}
export type ParticipantFormField = keyof ParticipantFormValues
export type ParticipantFormErrors = Partial<Record<ParticipantFormField, string>>

export const PARTICIPANT_MESSAGES = {
  nameRequired: 'Informe o nome do robô.',
  teamRequired: 'Informe a equipe.',
  weightClassRequired: 'Escolha a categoria de peso.',
  nameTaken: 'Já existe um robô com esse nome neste campeonato.',
  weightClassLocked: 'Este robô já está em lutas, então a categoria de peso não pode mudar.',
  nameInvalid: 'Nome inválido.',
  teamInvalid: 'Equipe inválida.',
  weightClassInvalid: 'Categoria de peso inválida.',
  notFound: 'O campeonato ou o participante não existe mais. Volte para a lista de participantes.',
  noConnection: 'Não foi possível conectar ao servidor. Tente novamente.',
  reviewFields: 'Revise os campos destacados.',
  generic: 'Não foi possível salvar o participante. Tente novamente.',
} as const

export const emptyParticipantValues = (): ParticipantFormValues => ({
  name: '',
  team: '',
  weightClass: '',
})

/** "Categoria de peso" picker options */
export const WEIGHT_CLASS_OPTIONS: SelectOption[] = WEIGHT_CLASSES.map((value) => ({
  value,
  label: WEIGHT_CLASS_LABELS[value],
}))

/** A weight class saved before the two classes existed is left blank, so the organizer picks one */
export function participantValuesFrom(robot: Robot): ParticipantFormValues {
  return {
    name: robot.name,
    team: robot.team,
    weightClass: isWeightClass(robot.weightClass) ? robot.weightClass : '',
  }
}

export function validateParticipantForm(values: ParticipantFormValues): ParticipantFormErrors {
  const errors: ParticipantFormErrors = {}
  if (!values.name.trim()) errors.name = PARTICIPANT_MESSAGES.nameRequired
  if (!values.team.trim()) errors.team = PARTICIPANT_MESSAGES.teamRequired
  if (!isWeightClass(values.weightClass)) {
    errors.weightClass = PARTICIPANT_MESSAGES.weightClassRequired
  }
  return errors
}

/** Same normalization as the API DTO. Call it only after validateParticipantForm passed. */
export function toRobotInput(values: ParticipantFormValues): RobotInput {
  return {
    name: normalizeText(values.name),
    team: normalizeText(values.team),
    // validateParticipantForm only lets one of the two classes through
    weightClass: values.weightClass as WeightClass,
  }
}

/** "Prévia na luta": CompetitorTile props, with stand-ins while fields are empty */
export function participantPreview(values: ParticipantFormValues): {
  team: string
  robot: string
  details?: string
} {
  const name = normalizeText(values.name)
  const team = normalizeText(values.team)
  return {
    robot: name || 'Nome do robô',
    team: team || 'Equipe',
    // "Peso leve" / "Peso pesado", in place of Figma's "Peso 3 kg"
    details: isWeightClass(values.weightClass)
      ? WEIGHT_CLASS_LABELS[values.weightClass]
      : undefined,
  }
}

// Service codes, then class-validator messages (they start with the property name)
const apiFieldMessages: [RegExp, ParticipantFormField, string][] = [
  [/^robot_name_taken$/, 'name', PARTICIPANT_MESSAGES.nameTaken],
  [/^robot_has_matches$/, 'weightClass', PARTICIPANT_MESSAGES.weightClassLocked],
  [/^name\b/, 'name', PARTICIPANT_MESSAGES.nameInvalid],
  [/^team\b/, 'team', PARTICIPANT_MESSAGES.teamInvalid],
  [/^weightClass\b/, 'weightClass', PARTICIPANT_MESSAGES.weightClassInvalid],
]

export function describeSaveError(error: unknown): {
  message: string
  fields: ParticipantFormErrors
} {
  if (error instanceof ApiError) {
    if (error.status === 0) return { message: PARTICIPANT_MESSAGES.noConnection, fields: {} }
    if (error.status === 404) return { message: PARTICIPANT_MESSAGES.notFound, fields: {} }
    if (error.status === 400 || error.status === 409) {
      const fields: ParticipantFormErrors = {}
      for (const detail of error.details) {
        const match = apiFieldMessages.find(([pattern]) => pattern.test(detail))
        if (match && !fields[match[1]]) fields[match[1]] = match[2]
      }
      if (Object.keys(fields).length > 0) {
        return { message: PARTICIPANT_MESSAGES.reviewFields, fields }
      }
    }
  }
  return { message: PARTICIPANT_MESSAGES.generic, fields: {} }
}
