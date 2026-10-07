// Pure logic for MatchFormView (Figma 10b): the two robot pickers, and validation mirroring
// `MatchesService.resolveRobots` in apps/api.
import { ApiError } from '@/api/client'
import type { SelectOption } from '@/components/ui/select-field'
import type { MatchInput } from '@/mocks'
import type { MatchSummary, Robot } from '@/types'
import { weightClassLabel } from '@/utils/robot'

export interface MatchFormValues {
  robotAId: string
  robotBId: string
}
export type MatchFormField = keyof MatchFormValues
export type MatchFormErrors = Partial<Record<MatchFormField, string>>

export const MATCH_MESSAGES = {
  robotARequired: 'Escolha o robô 1.',
  robotBRequired: 'Escolha o robô 2.',
  mustDiffer: 'Escolha dois robôs diferentes.',
  weightClassMismatch: 'Os dois robôs precisam ser da mesma categoria de peso.',
  notInChampionship: 'Um dos robôs não está inscrito neste campeonato. Recarregue a página.',
  robotNotFound: 'Um dos robôs foi removido. Recarregue a página.',
  notEditable: 'Esta luta não está mais programada e não pode ser alterada.',
  matchNotFound: 'Esta luta não existe mais.',
  championshipNotFound: 'Este campeonato não existe mais. Volte para meus campeonatos.',
  noConnection: 'Não foi possível conectar ao servidor. Tente novamente.',
  reviewFields: 'Revise os campos destacados.',
  generic: 'Não foi possível salvar a luta. Tente novamente.',
  deleteGeneric: 'Não foi possível excluir a luta. Tente novamente.',
} as const

export const emptyMatchValues = (): MatchFormValues => ({ robotAId: '', robotBId: '' })

export const matchValuesFrom = (match: MatchSummary): MatchFormValues => ({
  robotAId: match.robotAId,
  robotBId: match.robotBId,
})

export const toMatchInput = (values: MatchFormValues): MatchInput => ({
  robotAId: values.robotAId,
  robotBId: values.robotBId,
})

const slotNumber: Record<MatchFormField, 1 | 2> = { robotAId: 1, robotBId: 2 }
const otherSlot = (slot: MatchFormField): MatchFormField =>
  slot === 'robotAId' ? 'robotBId' : 'robotAId'
const findRobot = (robots: Robot[], id: string) => robots.find((r) => r.id === id)

/** "Equipe Órbita · Peso leve" */
export const robotSummary = (robot: Robot) =>
  `${robot.team} · ${weightClassLabel(robot.weightClass)}`

/** Hint under a picker: the picked robot's team and weight class */
export function robotHint(robots: Robot[], robotId: string): string | undefined {
  const robot = findRobot(robots, robotId)
  return robot ? robotSummary(robot) : undefined
}

/**
 * Options for one picker. Robô 2 lists only Robô 1's weight class once Robô 1 is picked. Robô 1
 * always lists every robot so the organizer can switch class (`pickRobot` then clears Robô 2).
 * The robot picked on the other side stays in the list, disabled.
 */
export function robotOptions(
  robots: Robot[],
  values: MatchFormValues,
  slot: MatchFormField,
): { groupLabel: string; options: SelectOption[] } {
  const other = otherSlot(slot)
  const weightClass =
    slot === 'robotBId' ? findRobot(robots, values.robotAId)?.weightClass : undefined
  const listed = weightClass ? robots.filter((r) => r.weightClass === weightClass) : robots
  return {
    groupLabel: weightClass ? `Participantes · ${weightClassLabel(weightClass)}` : 'Participantes',
    options: listed.map((robot) => {
      const taken = robot.id === values[other]
      return {
        value: robot.id,
        label: robot.name,
        meta: robotSummary(robot),
        disabled: taken,
        disabledReason: taken ? `Já escolhido como Robô ${slotNumber[other]}` : undefined,
      }
    }),
  }
}

/** Sets one side. A Robô 1 of another weight class clears Robô 2. */
export function pickRobot(
  robots: Robot[],
  values: MatchFormValues,
  slot: MatchFormField,
  robotId: string,
): MatchFormValues {
  const next: MatchFormValues = { ...values, [slot]: robotId }
  if (slot === 'robotAId') {
    const robotA = findRobot(robots, robotId)
    const robotB = findRobot(robots, next.robotBId)
    if (robotA && robotB && robotA.weightClass !== robotB.weightClass) next.robotBId = ''
  }
  return next
}

export function validateMatchForm(robots: Robot[], values: MatchFormValues): MatchFormErrors {
  const errors: MatchFormErrors = {}
  if (!values.robotAId) errors.robotAId = MATCH_MESSAGES.robotARequired
  if (!values.robotBId) errors.robotBId = MATCH_MESSAGES.robotBRequired
  else if (values.robotBId === values.robotAId) errors.robotBId = MATCH_MESSAGES.mustDiffer
  else {
    const robotA = findRobot(robots, values.robotAId)
    const robotB = findRobot(robots, values.robotBId)
    if (robotA && robotB && robotA.weightClass !== robotB.weightClass) {
      errors.robotBId = MATCH_MESSAGES.weightClassMismatch
    }
  }
  return errors
}

/** "Prévia na lista": "Marte × Cobalto" and "Equipe Órbita × Equipe Órbita · Peso leve" */
export function matchPreview(
  robots: Robot[],
  values: MatchFormValues,
): { robotA: string; robotB: string; teams: string } {
  const robotA = findRobot(robots, values.robotAId)
  const robotB = findRobot(robots, values.robotBId)
  const weightClass = (robotA ?? robotB)?.weightClass
  const teams = `${robotA?.team ?? 'Equipe'} × ${robotB?.team ?? 'Equipe'}`
  return {
    robotA: robotA?.name ?? 'Robô 1',
    robotB: robotB?.name ?? 'Robô 2',
    teams: weightClass ? `${teams} · ${weightClassLabel(weightClass)}` : teams,
  }
}

const apiFieldMessages: [string, MatchFormField, string][] = [
  ['match_robots_must_differ', 'robotBId', MATCH_MESSAGES.mustDiffer],
  ['match_weight_class_mismatch', 'robotBId', MATCH_MESSAGES.weightClassMismatch],
]

// Changed elsewhere since the form loaded: nothing to fix in the fields
const apiBannerMessages: [string, string][] = [
  ['robot_not_in_championship', MATCH_MESSAGES.notInChampionship],
  ['match_not_editable', MATCH_MESSAGES.notEditable],
  ['robot_not_found', MATCH_MESSAGES.robotNotFound],
  ['match_not_found', MATCH_MESSAGES.matchNotFound],
  ['championship_not_found', MATCH_MESSAGES.championshipNotFound],
]

/** Save and delete failures; `fallback` is the generic message for the action */
export function describeSaveError(
  error: unknown,
  fallback: string = MATCH_MESSAGES.generic,
): { message: string; fields: MatchFormErrors } {
  if (error instanceof ApiError) {
    if (error.status === 0) return { message: MATCH_MESSAGES.noConnection, fields: {} }
    const banner = apiBannerMessages.find(([code]) => error.details.includes(code))
    if (banner) return { message: banner[1], fields: {} }
    const fields: MatchFormErrors = {}
    for (const [code, field, message] of apiFieldMessages) {
      if (error.details.includes(code) && !fields[field]) fields[field] = message
    }
    if (Object.keys(fields).length > 0) return { message: MATCH_MESSAGES.reviewFields, fields }
  }
  return { message: fallback, fields: {} }
}
