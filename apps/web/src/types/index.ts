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

/**
 * apps/api (`GET /championships`) only returns id, name, scheduledDate (→ `startDate`) and
 * timestamps. Optional fields are not sent by the API yet: hide their UI when they are missing.
 */
export interface Championship {
  id: string
  name: string
  /** Free label shown on the card: "EDIÇÃO 01", "ETAPA 03", "INTERNO" */
  edition?: string
  description?: string
  /** "UTFPR, Curitiba" */
  location?: string
  startDate: string | null
  endDate?: string | null
  status?: ChampionshipStatus
  /** "inscrições abertas" */
  registrationOpen?: boolean
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
  /** Person responsible for the robot (Responsável) */
  owner: string
  /** "3 kg" */
  weightClass: string
  /** "Arrasto", "Girante", "Cunha" */
  category: string
  status: RobotStatus
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

export interface Match {
  id: string
  championshipId: string
  /** Fight number shown as "Luta 07" */
  number: number
  /** Manual position in the fight order; there is no automatic bracket */
  order: number
  arenaId: string
  weightClass: string
  robotAId: string
  robotBId: string
  state: MatchState
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
  createdAt: string
  modifiedAt: string
}

/** What a referee link resolves to */
export interface RefereeAccess {
  token: string
  matchId: string
  seat: RefereeSeat
  /** Link expired or already used on another device */
  expired: boolean
}
