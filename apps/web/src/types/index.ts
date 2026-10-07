// DRAFT: domain types inferred from the Figma screens. The backend is not finished, so these are
// not an API contract and will change. They follow the apps/api conventions where they exist
// (uuid string ids, camelCase, createdAt/modifiedAt, Match.weightClass). Dates are ISO strings.

// Status unions. Each one is a separate concern and must never be merged with another.

/** Championship lifecycle: Programado / Em andamento / Encerrado */
export type ChampionshipStatus = 'scheduled' | 'running' | 'finished'

/** Fight state, separate from recording/upload/analysis */
export type MatchState = 'waiting' | 'running' | 'paused' | 'finished'

/** Recording, upload and analysis state: pendente / processando / concluído / falhou */
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed'

/** Participant registration: Apto / Pesagem pendente */
export type RobotStatus = 'eligible' | 'pending-weigh-in'

/** Referee seat connection: Aguardando / Conectado */
export type RefereeConnectionStatus = 'waiting' | 'connected'

/** Lado A (blue, left) or Lado B (pink, right) */
export type Side = 'A' | 'B'

/** Every match has exactly three referee seats */
export type RefereeSeat = 1 | 2 | 3

/** How a fight ended: desistência / pontos / nocaute */
export type MatchEndReason = 'surrender' | 'points' | 'knockout'

/** Robot weight class: only two for now (no kilograms). A match pairs robots of one class. */
export type WeightClass = 'lightweight' | 'heavyweight'

/** Optional fields are missing from some demo data: hide their UI when they are missing. */
export interface Championship {
  id: string
  name: string
  startDate: string | null
  endDate?: string | null
  status?: ChampionshipStatus
  /** Card summary: "16 robôs · 6 de 15 lutas" */
  robotCount?: number
  fightsDone?: number
  fightsTotal?: number
  createdAt: string
  modifiedAt: string
}

export interface Arena {
  id: string
  championshipId: string
  /** "Arena 01" */
  name: string
}

/** A participant: one robot entered in a championship */
export interface Robot {
  id: string
  championshipId: string
  name: string
  team: string
  /** Demo data only: the API has no owner (Responsável), and the UI no longer shows it */
  owner?: string
  /** A `WeightClass`; robots saved before weight classes were fixed may hold other text */
  weightClass: string
  /** Demo data only: combat category ("Arrasto", "Girante", "Cunha"), not shown */
  category?: string
  /** Demo data only: weigh-in status, not shown */
  status?: RobotStatus
  createdAt: string
  modifiedAt: string
}

export interface Referee {
  id: string
  /** "M. Ribeiro" */
  name: string
}

export interface MatchReferee {
  seat: RefereeSeat
  /** `null` while the seat is open ("vaga aberta") */
  referee: Referee | null
  connectionStatus: RefereeConnectionStatus
  /** Referee pressed "Estou pronto" */
  ready: boolean
}

/** One referee's own values for one match. There is no official total: the formula is undecided. */
export interface RefereeScore {
  matchId: string
  seat: RefereeSeat
  refereeId: string
  scoreA: number
  scoreB: number
  submittedAt: string
}

export interface MatchResult {
  winnerSide: Side
  reason: MatchEndReason
  durationSeconds: number
  /** Operator confirmed the result (Resultado confirmado / Aguardando confirmação) */
  confirmed: boolean
}

/** Heatmap generated from the recording, one per robot */
export interface RobotHeatmap {
  robotId: string
  status: ProcessingStatus
  detectedPositions: number | null
}

/** What the organizer screens need from a match (Figma 10 and 10b) */
export interface MatchSummary {
  id: string
  championshipId: string
  /** Shared by both robots; see `Robot.weightClass` */
  weightClass: string
  robotAId: string
  robotBId: string
  state: MatchState
  createdAt: string
  modifiedAt: string
}

/** A match with the operator, referee and public fields (still demo data only) */
export interface Match extends MatchSummary {
  /** Fight number shown as "Luta 07" */
  number: number
  /** Manual position in the fight order; there is no automatic bracket */
  order: number
  arenaId: string
  roundDurationSeconds: number
  elapsedSeconds: number
  startedAt: string | null
  operatorName: string | null
  /** "Logitech C920 · 1080p" */
  camera: string | null
  referees: MatchReferee[]
  result: MatchResult | null
  recordingStatus: ProcessingStatus
  uploadStatus: ProcessingStatus
  /** 0–100 while the upload is processing */
  uploadProgress: number | null
  analysisStatus: ProcessingStatus
  heatmaps: RobotHeatmap[]
}

/** What a referee link resolves to */
export interface RefereeAccess {
  token: string
  matchId: string
  seat: RefereeSeat
  /** Link expired or already used on another device */
  expired: boolean
}
