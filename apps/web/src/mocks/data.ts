// Demo data taken from the Figma screens. Pages must not import this file:
// use the functions in `@/mocks` so the data source can be swapped for the API later.
import type {
  Arena,
  Championship,
  Match,
  MatchEndReason,
  MatchReferee,
  Referee,
  RefereeAccess,
  RefereeScore,
  Robot,
} from '@/types'

const TIMESTAMP = '2026-09-01T12:00:00.000Z'

// Readable fixed ids keep demo URLs stable across reloads
export const COPA_2026_ID = '6f1c2a40-0001-4000-8000-000000000001'

export const championships: Championship[] = [
  {
    id: COPA_2026_ID,
    name: 'Copa Crossliseu 2026',
    edition: 'Edição 01',
    description: 'Etapa final da temporada 2026 de robótica de combate da UTFPR.',
    location: 'UTFPR, Curitiba',
    startDate: '2026-12-09',
    endDate: '2026-12-09',
    status: 'running',
    registrationOpen: false,
    createdAt: TIMESTAMP,
    modifiedAt: TIMESTAMP,
  },
  {
    id: '6f1c2a40-0001-4000-8000-000000000002',
    name: 'Desafio de Robótica · Verão',
    edition: 'Edição 02',
    description: '',
    location: 'UTFPR, Curitiba',
    startDate: '2026-12-19',
    endDate: null,
    status: 'scheduled',
    registrationOpen: true,
    createdAt: TIMESTAMP,
    modifiedAt: TIMESTAMP,
  },
  {
    id: '6f1c2a40-0001-4000-8000-000000000003',
    name: 'Arena UTFPR · Etapa 3',
    edition: 'Etapa 03',
    description: '',
    location: 'UTFPR, Curitiba',
    startDate: '2027-01-24',
    endDate: null,
    status: 'scheduled',
    registrationOpen: false,
    createdAt: TIMESTAMP,
    modifiedAt: TIMESTAMP,
  },
  {
    id: '6f1c2a40-0001-4000-8000-000000000004',
    name: 'Copa Crossliseu 2025',
    edition: 'Edição 01',
    description: '',
    location: 'UTFPR, Curitiba',
    startDate: '2025-12-10',
    endDate: '2025-12-10',
    status: 'finished',
    registrationOpen: false,
    createdAt: TIMESTAMP,
    modifiedAt: TIMESTAMP,
  },
  {
    id: '6f1c2a40-0001-4000-8000-000000000005',
    name: 'Torneio Interclasses',
    edition: 'Interno',
    description: '',
    location: 'UTFPR, Curitiba',
    startDate: '2025-09-22',
    endDate: '2025-09-22',
    status: 'finished',
    registrationOpen: false,
    createdAt: TIMESTAMP,
    modifiedAt: TIMESTAMP,
  },
  {
    id: '6f1c2a40-0001-4000-8000-000000000006',
    name: 'Seletiva Regional Sul',
    edition: 'Regional',
    description: '',
    location: 'UTFPR, Curitiba',
    startDate: '2025-08-03',
    endDate: '2025-08-03',
    status: 'finished',
    registrationOpen: false,
    createdAt: TIMESTAMP,
    modifiedAt: TIMESTAMP,
  },
]

/** Championships the demo organizer (E. Vidias) can manage */
export const managedChampionshipIds: string[] = [
  COPA_2026_ID,
  '6f1c2a40-0001-4000-8000-000000000002',
  '6f1c2a40-0001-4000-8000-000000000004',
]

export const ARENA_01_ID = '6f1c2a40-0002-4000-8000-000000000001'
export const ARENA_02_ID = '6f1c2a40-0002-4000-8000-000000000002'

export const arenas: Arena[] = [
  { id: ARENA_01_ID, championshipId: COPA_2026_ID, name: 'Arena 01' },
  { id: ARENA_02_ID, championshipId: COPA_2026_ID, name: 'Arena 02' },
]

function robot(
  n: number,
  name: string,
  team: string,
  owner: string,
  category: string,
  status: Robot['status'] = 'eligible',
): Robot {
  return {
    id: `6f1c2a40-0003-4000-8000-${String(n).padStart(12, '0')}`,
    championshipId: COPA_2026_ID,
    name,
    team,
    owner,
    weightClass: '3 kg',
    category,
    status,
    createdAt: TIMESTAMP,
    modifiedAt: TIMESTAMP,
  }
}

export const robots: Robot[] = [
  robot(1, 'Titã', 'Equipe Volt', 'A. Moraes', 'Arrasto'),
  robot(2, 'Nêmesis', 'Equipe Impacto', 'R. Silveira', 'Girante'),
  robot(3, 'Aço', 'Equipe Aço', 'C. Bianchi', 'Cunha'),
  robot(4, 'Faísca', 'Equipe Faísca', 'J. Prado', 'Girante'),
  robot(5, 'Marte', 'Equipe Órbita', 'L. Tavares', 'Arrasto', 'pending-weigh-in'),
  robot(6, 'Cobalto', 'Equipe Órbita', 'L. Tavares', 'Cunha', 'pending-weigh-in'),
  robot(7, 'Vórtex', 'Equipe Ciclone', 'T. Andrade', 'Girante'),
  robot(8, 'Atlas', 'Equipe Titânio', 'F. Nogueira', 'Arrasto'),
  robot(9, 'Quasar', 'Equipe Nebulosa', 'B. Rocha', 'Cunha'),
]

function robotId(name: string): string {
  const found = robots.find((r) => r.name === name)
  if (!found) throw new Error(`Unknown demo robot: ${name}`)
  return found.id
}

export const referees: Referee[] = [
  { id: '6f1c2a40-0004-4000-8000-000000000001', name: 'M. Ribeiro' },
  { id: '6f1c2a40-0004-4000-8000-000000000002', name: 'L. Costa' },
  { id: '6f1c2a40-0004-4000-8000-000000000003', name: 'P. Almeida' },
]

const [ribeiro, costa, almeida] = referees as [Referee, Referee, Referee]

const allConnected: MatchReferee[] = [
  { seat: 1, referee: ribeiro, connectionStatus: 'connected', ready: true },
  { seat: 2, referee: costa, connectionStatus: 'connected', ready: true },
  { seat: 3, referee: almeida, connectionStatus: 'connected', ready: true },
]

const unassigned: MatchReferee[] = [
  { seat: 1, referee: null, connectionStatus: 'waiting', ready: false },
  { seat: 2, referee: null, connectionStatus: 'waiting', ready: false },
  { seat: 3, referee: null, connectionStatus: 'waiting', ready: false },
]

export const matchId = (n: number) => `6f1c2a40-0005-4000-8000-${String(n).padStart(12, '0')}`

type MatchOverrides = Partial<Match> & Pick<Match, 'number' | 'order' | 'robotAId' | 'robotBId'>

function match(overrides: MatchOverrides): Match {
  return {
    id: matchId(overrides.number),
    championshipId: COPA_2026_ID,
    arenaId: ARENA_01_ID,
    weightClass: '3 kg',
    state: 'waiting',
    roundDurationSeconds: 180,
    elapsedSeconds: 0,
    startedAt: null,
    operatorName: null,
    camera: null,
    referees: unassigned,
    result: null,
    recordingStatus: 'pending',
    uploadStatus: 'pending',
    uploadProgress: null,
    analysisStatus: 'pending',
    heatmaps: [],
    createdAt: TIMESTAMP,
    modifiedAt: TIMESTAMP,
    ...overrides,
  }
}

function finishedMatch(
  number: number,
  winner: string,
  loser: string,
  reason: MatchEndReason,
): Match {
  return match({
    number,
    order: number,
    robotAId: robotId(winner),
    robotBId: robotId(loser),
    state: 'finished',
    elapsedSeconds: 180,
    startedAt: '2026-12-09T14:00:00.000Z',
    operatorName: 'M. Ribeiro',
    camera: 'Logitech C920 · 1080p',
    referees: allConnected,
    result: { winnerSide: 'A', reason, durationSeconds: 180, confirmed: true },
    recordingStatus: 'completed',
    uploadStatus: 'completed',
    analysisStatus: 'completed',
    heatmaps: [
      { robotId: robotId(winner), status: 'completed', detectedPositions: 1500 },
      { robotId: robotId(loser), status: 'completed', detectedPositions: 1500 },
    ],
  })
}

export const matches: Match[] = [
  finishedMatch(3, 'Atlas', 'Cobalto', 'knockout'),
  finishedMatch(4, 'Quasar', 'Marte', 'points'),
  // Fight 06: Aço beat Faísca by surrender; Faísca's heatmap is still processing
  match({
    number: 6,
    order: 6,
    robotAId: robotId('Aço'),
    robotBId: robotId('Faísca'),
    state: 'finished',
    elapsedSeconds: 133,
    startedAt: '2026-12-09T15:12:00.000-03:00',
    operatorName: 'M. Ribeiro',
    camera: 'Logitech C920 · 1080p',
    referees: allConnected,
    result: { winnerSide: 'A', reason: 'surrender', durationSeconds: 133, confirmed: true },
    recordingStatus: 'completed',
    uploadStatus: 'completed',
    analysisStatus: 'processing',
    heatmaps: [
      { robotId: robotId('Aço'), status: 'completed', detectedPositions: 1284 },
      { robotId: robotId('Faísca'), status: 'processing', detectedPositions: null },
    ],
  }),
  // Fight 07: live now
  match({
    number: 7,
    order: 7,
    robotAId: robotId('Titã'),
    robotBId: robotId('Nêmesis'),
    state: 'running',
    elapsedSeconds: 78,
    startedAt: '2026-12-09T15:30:00.000-03:00',
    operatorName: 'M. Ribeiro',
    camera: 'Logitech C920 · 1080p',
    referees: allConnected,
    recordingStatus: 'processing',
  }),
  // Fight 08: next up, two of three referees connected
  match({
    number: 8,
    order: 8,
    robotAId: robotId('Marte'),
    robotBId: robotId('Cobalto'),
    camera: 'Logitech C920 · USB',
    referees: [
      { seat: 1, referee: ribeiro, connectionStatus: 'connected', ready: true },
      { seat: 2, referee: costa, connectionStatus: 'connected', ready: true },
      { seat: 3, referee: null, connectionStatus: 'waiting', ready: false },
    ],
  }),
  match({
    number: 9,
    order: 9,
    arenaId: ARENA_02_ID,
    robotAId: robotId('Vórtex'),
    robotBId: robotId('Atlas'),
  }),
  match({
    number: 10,
    order: 10,
    arenaId: ARENA_02_ID,
    robotAId: robotId('Faísca'),
    robotBId: robotId('Quasar'),
  }),
]

export const refereeScores: RefereeScore[] = [
  {
    matchId: matchId(6),
    seat: 1,
    refereeId: ribeiro.id,
    scoreA: 4,
    scoreB: 2,
    submittedAt: '2026-12-09T15:14:00.000-03:00',
  },
  {
    matchId: matchId(6),
    seat: 2,
    refereeId: costa.id,
    scoreA: 3,
    scoreB: 2,
    submittedAt: '2026-12-09T15:14:00.000-03:00',
  },
  {
    matchId: matchId(6),
    seat: 3,
    refereeId: almeida.id,
    scoreA: 4,
    scoreB: 1,
    submittedAt: '2026-12-09T15:15:00.000-03:00',
  },
]

export const refereeAccesses: RefereeAccess[] = [
  { token: 'demo-referee-2', matchId: matchId(8), seat: 2, expired: false },
  { token: 'demo-expired', matchId: matchId(8), seat: 3, expired: true },
]
