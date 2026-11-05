// Pure logic for MatchFormView (Figma ORG-07a/b and ORG-08): step 1 picks the category and the
// time, step 2 the two robots of that category. Validation mirrors `MatchesService.resolveRobots`
// in apps/api.
import { ApiError } from '@/api/client'
import type { SelectOption } from '@/components/ui/select-field'
import type { MatchInput } from '@/mocks'
import type { MatchSummary, Robot, WeightClass } from '@/types'

export interface MatchFormValues {
  weightClass: WeightClass | ''
  /** `datetime-local` value ("2026-12-09T14:30"), in the browser's time zone */
  scheduledAt: string
  robotAId: string
  robotBId: string
}
export type MatchFormField = keyof MatchFormValues
export type RobotField = 'robotAId' | 'robotBId'
export type MatchFormErrors = Partial<Record<MatchFormField, string>>

export const MATCH_MESSAGES = {
  weightClassRequired: 'Escolha a categoria de peso.',
  scheduledAtRequired: 'Informe a data e o horário.',
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

export const emptyMatchValues = (): MatchFormValues => ({
  weightClass: '',
  scheduledAt: '',
  robotAId: '',
  robotBId: '',
})

/** `datetime-local` value → ISO timestamp, read in the browser's time zone */
export const toScheduledAtIso = (local: string): string => new Date(local).toISOString()

const pad2 = (value: number) => String(value).padStart(2, '0')

/** ISO timestamp → `datetime-local` value ("YYYY-MM-DDTHH:mm") in the browser's time zone */
export function toLocalInput(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(
    date.getHours(),
  )}:${pad2(date.getMinutes())}`
}

export const matchValuesFrom = (match: MatchSummary): MatchFormValues => ({
  weightClass: match.weightClass,
  scheduledAt: toLocalInput(match.scheduledAt),
  robotAId: match.robotAId,
  robotBId: match.robotBId,
})

export const toMatchInput = (values: MatchFormValues): MatchInput => ({
  robotAId: values.robotAId,
  robotBId: values.robotBId,
  scheduledAt: toScheduledAtIso(values.scheduledAt),
})

/** Step 1 (ORG-07a): the category and the planned time */
export function validateStep1(values: MatchFormValues): MatchFormErrors {
  const errors: MatchFormErrors = {}
  if (!values.weightClass) errors.weightClass = MATCH_MESSAGES.weightClassRequired
  if (!values.scheduledAt || Number.isNaN(new Date(values.scheduledAt).getTime())) {
    errors.scheduledAt = MATCH_MESSAGES.scheduledAtRequired
  }
  return errors
}

const slotNumber: Record<RobotField, 1 | 2> = { robotAId: 1, robotBId: 2 }
const otherSlot = (slot: RobotField): RobotField => (slot === 'robotAId' ? 'robotBId' : 'robotAId')
const findRobot = (robots: Robot[], id: string) => robots.find((r) => r.id === id)

/** Robots a match of this category can pair */
export const robotsInClass = (robots: Robot[], weightClass: WeightClass | ''): Robot[] =>
  weightClass ? robots.filter((r) => r.weightClass === weightClass) : []

/** Changes the category; picked robots of another class are cleared */
export function withWeightClass(
  robots: Robot[],
  values: MatchFormValues,
  weightClass: WeightClass | '',
): MatchFormValues {
  const keep = (id: string) => (findRobot(robots, id)?.weightClass === weightClass ? id : '')
  return {
    ...values,
    weightClass,
    robotAId: keep(values.robotAId),
    robotBId: keep(values.robotBId),
  }
}

/** "Equipe Órbita · beetleweight" */
export const robotSummary = (robot: Robot) => `${robot.team} · ${robot.weightClass}`

/** Hint under a picker: the picked robot's team and weight class */
export function robotHint(robots: Robot[], robotId: string): string | undefined {
  const robot = findRobot(robots, robotId)
  return robot ? robotSummary(robot) : undefined
}

/**
 * Options for one picker: only robots of the chosen category. The robot picked on the other side
 * stays in the list, disabled.
 */
export function robotOptions(
  robots: Robot[],
  values: MatchFormValues,
  slot: RobotField,
): { groupLabel: string; options: SelectOption[] } {
  const other = otherSlot(slot)
  const { weightClass } = values
  return {
    groupLabel: weightClass ? `Participantes · ${weightClass}` : 'Participantes',
    options: robotsInClass(robots, weightClass).map((robot) => {
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

/** "Prévia na lista": "Marte × Cobalto" and "Equipe Órbita × Equipe Órbita · beetleweight" */
export function matchPreview(
  robots: Robot[],
  values: MatchFormValues,
): { robotA: string; robotB: string; teams: string } {
  const robotA = findRobot(robots, values.robotAId)
  const robotB = findRobot(robots, values.robotBId)
  const { weightClass } = values
  const teams = `${robotA?.team ?? 'Equipe'} × ${robotB?.team ?? 'Equipe'}`
  return {
    robotA: robotA?.name ?? 'Robô 1',
    robotB: robotB?.name ?? 'Robô 2',
    teams: weightClass ? `${teams} · ${weightClass}` : teams,
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
