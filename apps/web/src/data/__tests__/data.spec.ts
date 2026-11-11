import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import type * as arenasApi from '@/api/arenas'
import type * as championshipsApi from '@/api/championships'
import type * as matchesApi from '@/api/matches'
import type * as robotsApi from '@/api/robots'

vi.mock('@/api/championships', () => ({
  listChampionships: vi.fn<typeof championshipsApi.listChampionships>(),
  getChampionship: vi.fn<typeof championshipsApi.getChampionship>(),
  listMyChampionships: vi.fn<typeof championshipsApi.listMyChampionships>(),
  createChampionship: vi.fn<typeof championshipsApi.createChampionship>(),
  updateChampionship: vi.fn<typeof championshipsApi.updateChampionship>(),
}))
vi.mock('@/api/arenas', () => ({
  listArenas: vi.fn<typeof arenasApi.listArenas>(),
  createArena: vi.fn<typeof arenasApi.createArena>(),
  renameArena: vi.fn<typeof arenasApi.renameArena>(),
  rotateArenaToken: vi.fn<typeof arenasApi.rotateArenaToken>(),
  deleteArena: vi.fn<typeof arenasApi.deleteArena>(),
  setArenaCurrentMatch: vi.fn<typeof arenasApi.setArenaCurrentMatch>(),
}))
vi.mock('@/api/robots', () => ({
  listRobots: vi.fn<typeof robotsApi.listRobots>(),
  createRobot: vi.fn<typeof robotsApi.createRobot>(),
  updateRobot: vi.fn<typeof robotsApi.updateRobot>(),
  deleteRobot: vi.fn<typeof robotsApi.deleteRobot>(),
}))
vi.mock('@/api/matches', () => ({
  listMatches: vi.fn<typeof matchesApi.listMatches>(),
  getMatchById: vi.fn<typeof matchesApi.getMatchById>(),
  createMatch: vi.fn<typeof matchesApi.createMatch>(),
  updateMatch: vi.fn<typeof matchesApi.updateMatch>(),
  deleteMatch: vi.fn<typeof matchesApi.deleteMatch>(),
  getFightState: vi.fn<typeof matchesApi.getFightState>(),
  sendFightCommand: vi.fn<typeof matchesApi.sendFightCommand>(),
}))

import {
  createArena,
  deleteArena,
  listArenas,
  renameArena as patchArena,
  rotateArenaToken,
  setArenaCurrentMatch,
  type ApiArena,
} from '@/api/arenas'
import {
  getChampionship as fetchChampionship,
  listMyChampionships,
  type ApiChampionship,
} from '@/api/championships'
import {
  createMatch as postMatch,
  getMatchById,
  listMatches,
  getFightState as fetchFightState,
  sendFightCommand as postFightCommand,
  type ApiMatch,
  type OperatorFightState,
} from '@/api/matches'
import { createRobot as postRobot, listRobots, type ApiRobot } from '@/api/robots'
import {
  addArena,
  createMatch,
  createRobot,
  getMyArenas,
  newArenaToken,
  removeArena,
  renameArena,
  getArenas,
  getChampionship,
  getMatch,
  getFightState,
  requestRecordingUpload,
  confirmRecordingUpload,
  sendFightCommand,
  getManagedChampionships,
  getMatchSummaries,
  getMatchSummary,
  matchChampionshipId,
  selectArenaMatch,
  ownsChampionship,
  getRefereeAccess,
  getRobots,
} from '@/data'

const createdAt = '2026-10-01T00:00:00.000Z'
const modifiedAt = '2026-10-02T00:00:00.000Z'

const apiChampionship: ApiChampionship = {
  id: 'c1',
  name: 'Copa',
  startDate: '2026-10-04',
  endDate: '2026-10-06',
  status: 'ongoing',
  robotCount: 2,
  fightsTotal: 1,
  fightsDone: 0,
  createdAt,
  modifiedAt,
  deletedAt: null,
}

const apiRobot: ApiRobot = {
  id: 'r1',
  championshipId: 'c1',
  name: 'Titã',
  team: 'Equipe Volt',
  weightClass: 'beetleweight',
  createdAt,
  modifiedAt,
  deletedAt: null,
}

const apiArena: ApiArena = {
  id: 'a1',
  name: 'Arena da garagem',
  deviceId: 'arena-da-garagem-7f3a',
  online: false,
  currentMatchId: 'm1',
  currentMatch: { id: 'm1', robotAName: 'Titã', robotBName: 'Volt' },
}

const apiMatch: ApiMatch = {
  id: 'm1',
  championshipId: 'c1',
  weightClass: 'beetleweight',
  state: 'paused',
  scheduledAt: '2026-12-09T13:00:00.000Z',
  arenaId: 'a1',
  endReason: null,
  winnerRobotId: null,
  robotAId: 'r1',
  robotBId: 'r2',
  robotA: apiRobot,
  createdAt,
  modifiedAt,
  deletedAt: null,
}

describe('@/data', () => {
  beforeEach(() => {
    vi.mocked(listRobots).mockReset()
    vi.mocked(listMyChampionships).mockReset()
    vi.mocked(getMatchById).mockReset()
    vi.mocked(listMatches).mockReset()
    vi.mocked(postRobot).mockReset()
    vi.mocked(postMatch).mockReset()
  })

  it('maps API robots to the domain type', async () => {
    vi.mocked(listRobots).mockResolvedValue([apiRobot])

    expect(await getRobots('c1')).toEqual([
      {
        id: 'r1',
        championshipId: 'c1',
        name: 'Titã',
        team: 'Equipe Volt',
        weightClass: 'beetleweight',
        createdAt,
        modifiedAt,
      },
    ])
    expect(listRobots).toHaveBeenCalledWith('c1')
  })

  it('maps the match state and scheduledAt and drops the embedded robots', async () => {
    vi.mocked(listMatches).mockResolvedValue([apiMatch])

    expect(await getMatchSummaries('c1')).toEqual([
      {
        id: 'm1',
        championshipId: 'c1',
        weightClass: 'beetleweight',
        robotAId: 'r1',
        robotBId: 'r2',
        arenaId: 'a1',
        state: 'paused',
        scheduledAt: '2026-12-09T13:00:00.000Z',
        createdAt,
        modifiedAt,
      },
    ])
  })

  it('adds the championship id to create payloads', async () => {
    vi.mocked(postRobot).mockResolvedValue(apiRobot)
    vi.mocked(postMatch).mockResolvedValue(apiMatch)

    await createRobot(
      'c1',
      { name: 'Titã', team: 'Equipe Volt', weightClass: 'beetleweight' },
      'tok',
    )
    await createMatch(
      'c1',
      { robotAId: 'r1', robotBId: 'r2', scheduledAt: '2026-12-09T13:00:00.000Z' },
      'tok',
    )

    expect(postRobot).toHaveBeenCalledWith(
      { name: 'Titã', team: 'Equipe Volt', weightClass: 'beetleweight', championshipId: 'c1' },
      'tok',
    )
    expect(postMatch).toHaveBeenCalledWith(
      {
        robotAId: 'r1',
        robotBId: 'r2',
        scheduledAt: '2026-12-09T13:00:00.000Z',
        championshipId: 'c1',
      },
      'tok',
    )
  })

  it('resolves unknown or malformed championship ids to null and rethrows other errors', async () => {
    vi.mocked(fetchChampionship).mockRejectedValueOnce(new ApiError(404, 'not found'))
    vi.mocked(fetchChampionship).mockRejectedValueOnce(new ApiError(400, 'bad uuid'))
    vi.mocked(fetchChampionship).mockRejectedValueOnce(new ApiError(500, 'boom'))

    expect(await getChampionship('missing')).toBeNull()
    expect(await getChampionship('not-a-uuid')).toBeNull()
    await expect(getChampionship('c1')).rejects.toMatchObject({ status: 500 })
  })

  it('lists the managed championships from the account-scoped endpoint with the token', async () => {
    vi.mocked(listMyChampionships).mockResolvedValueOnce([
      { ...apiChampionship, id: 'c1' },
      { ...apiChampionship, id: 'c2' },
    ])

    const list = await getManagedChampionships('t')

    expect(listMyChampionships).toHaveBeenCalledWith('t')
    expect(list.map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('owns a championship only when it is in the account list', async () => {
    vi.mocked(listMyChampionships).mockResolvedValue([{ ...apiChampionship, id: 'c1' }])

    expect(await ownsChampionship('c1', 't')).toBe(true)
    expect(await ownsChampionship('other', 't')).toBe(false)
  })

  it('resolves a match to its championship id, or null for unknown or malformed ids', async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(apiMatch)
    vi.mocked(getMatchById).mockRejectedValueOnce(new ApiError(404, 'match_not_found'))
    vi.mocked(getMatchById).mockRejectedValueOnce(new ApiError(400, 'bad uuid'))
    vi.mocked(getMatchById).mockRejectedValueOnce(new ApiError(500, 'boom'))

    expect(await matchChampionshipId('m1')).toBe('c1')
    expect(await matchChampionshipId('missing')).toBeNull()
    expect(await matchChampionshipId('not-a-uuid')).toBeNull()
    await expect(matchChampionshipId('m1')).rejects.toMatchObject({ status: 500 })
  })

  it('rejects data the API does not provide yet instead of serving demo data', async () => {
    await expect(getMatch('m1')).rejects.toMatchObject({ status: 501 })
    await expect(getRefereeAccess('token')).rejects.toMatchObject({ status: 501 })
  })

  it('maps API arenas to ManagedArena, without id or online of the match', async () => {
    vi.mocked(listArenas).mockResolvedValue([
      apiArena,
      { ...apiArena, id: 'a2', currentMatchId: null, currentMatch: null },
    ])

    const list = await getMyArenas('t')

    expect(listArenas).toHaveBeenCalledWith('t')
    expect(list).toEqual([
      {
        id: 'a1',
        name: 'Arena da garagem',
        deviceId: 'arena-da-garagem-7f3a',
        currentMatch: { robotAName: 'Titã', robotBName: 'Volt' },
      },
      { id: 'a2', name: 'Arena da garagem', deviceId: 'arena-da-garagem-7f3a', currentMatch: null },
    ])
  })

  it('creates an arena and returns it with its credentials', async () => {
    const credentials = { deviceId: 'arena-da-garagem-7f3a', token: 'ab', serverUrl: null }
    vi.mocked(createArena).mockResolvedValue({ arena: apiArena, credentials })

    const result = await addArena('Arena da garagem', 't')

    expect(createArena).toHaveBeenCalledWith('Arena da garagem', 't')
    expect(result.credentials).toEqual(credentials)
    expect(result.arena).toMatchObject({ id: 'a1', currentMatch: { robotAName: 'Titã' } })
    expect(result.arena).not.toHaveProperty('online')
  })

  it('renames an arena', async () => {
    vi.mocked(patchArena).mockResolvedValue({ ...apiArena, name: 'Nova' })

    expect(await renameArena('a1', 'Nova', 't')).toMatchObject({ id: 'a1', name: 'Nova' })
    expect(patchArena).toHaveBeenCalledWith('a1', 'Nova', 't')
  })

  it('rotates the token and removes an arena', async () => {
    const credentials = { deviceId: 'd', token: 'new', serverUrl: 'wss://x/arena' }
    vi.mocked(rotateArenaToken).mockResolvedValue(credentials)
    vi.mocked(deleteArena).mockResolvedValue(undefined)

    expect(await newArenaToken('a1', 't')).toEqual(credentials)
    expect(rotateArenaToken).toHaveBeenCalledWith('a1', 't')
    await removeArena('a1', 't')
    expect(deleteArena).toHaveBeenCalledWith('a1', 't')
  })

  it('lets arena errors through as ApiError', async () => {
    vi.mocked(deleteArena).mockRejectedValue(new ApiError(409, 'arena_match_live'))

    await expect(removeArena('a1', 't')).rejects.toMatchObject({ status: 409 })
  })

  it('maps API arenas to the operator Arena with the online flag and current match', async () => {
    vi.mocked(listArenas).mockResolvedValue([
      apiArena,
      { ...apiArena, id: 'a2', online: true, currentMatchId: null, currentMatch: null },
    ])

    const list = await getArenas('t')

    expect(listArenas).toHaveBeenCalledWith('t')
    expect(list).toEqual([
      {
        id: 'a1',
        name: 'Arena da garagem',
        online: false,
        currentMatchId: 'm1',
        currentMatch: { robotAName: 'Titã', robotBName: 'Volt' },
      },
      {
        id: 'a2',
        name: 'Arena da garagem',
        online: true,
        currentMatchId: null,
        currentMatch: null,
      },
    ])
  })

  it('picks the arena match and maps the updated arena', async () => {
    vi.mocked(setArenaCurrentMatch).mockResolvedValueOnce(apiArena)

    expect(await selectArenaMatch('a1', 'm1', 't')).toEqual({
      id: 'a1',
      name: 'Arena da garagem',
      online: false,
      currentMatchId: 'm1',
      currentMatch: { robotAName: 'Titã', robotBName: 'Volt' },
    })
    expect(setArenaCurrentMatch).toHaveBeenCalledWith('a1', 'm1', 't')
  })

  it('lets a refused pick through as ApiError', async () => {
    vi.mocked(setArenaCurrentMatch).mockRejectedValueOnce(new ApiError(409, 'arena_match_started'))

    await expect(selectArenaMatch('a1', 'm1', 't')).rejects.toMatchObject({
      status: 409,
      message: 'arena_match_started',
    })
  })

  it('loads one match summary, or null for unknown or malformed ids', async () => {
    vi.mocked(getMatchById).mockResolvedValueOnce(apiMatch)
    vi.mocked(getMatchById).mockRejectedValueOnce(new ApiError(404, 'match_not_found'))
    vi.mocked(getMatchById).mockRejectedValueOnce(new ApiError(400, 'bad uuid'))
    vi.mocked(getMatchById).mockRejectedValueOnce(new ApiError(500, 'boom'))

    expect(await getMatchSummary('m1')).toEqual({
      id: 'm1',
      championshipId: 'c1',
      weightClass: 'beetleweight',
      robotAId: 'r1',
      robotBId: 'r2',
      arenaId: 'a1',
      state: 'paused',
      scheduledAt: '2026-12-09T13:00:00.000Z',
      createdAt,
      modifiedAt,
    })
    expect(await getMatchSummary('missing')).toBeNull()
    expect(await getMatchSummary('not-a-uuid')).toBeNull()
    await expect(getMatchSummary('m1')).rejects.toMatchObject({ status: 500 })
  })
})

describe('operator fight data', () => {
  const finished: OperatorFightState = {
    matchId: 'm1',
    status: 'finished',
    remainingMs: 40_000,
    endReason: 'manual',
    robots: { A: { name: 'Titã' }, B: { name: 'Volt' } },
    closed: false,
    winnerSide: null,
    hasSelectedArena: true,
  }

  it('preserves the selected arena and the closed flag on reads and commands', async () => {
    const signal = new AbortController().signal
    const closed = { ...finished, closed: true, hasSelectedArena: false }
    vi.mocked(fetchFightState).mockResolvedValueOnce(finished)
    vi.mocked(postFightCommand).mockResolvedValueOnce(closed)

    expect(await getFightState('m1', signal)).toEqual(finished)
    expect(await sendFightCommand('m1', 'close', 'token', signal)).toEqual(closed)
    expect(fetchFightState).toHaveBeenCalledWith('m1', signal)
    expect(postFightCommand).toHaveBeenCalledWith('m1', 'close', 'token', signal)
  })

  it('propagates the API error for state reads and commands', async () => {
    const missing = new ApiError(404, 'match_not_found')
    const conflict = new ApiError(409, 'match_invalid_transition')
    vi.mocked(fetchFightState).mockRejectedValueOnce(missing)
    vi.mocked(postFightCommand).mockRejectedValueOnce(conflict)

    await expect(getFightState('m1')).rejects.toBe(missing)
    await expect(sendFightCommand('m1', 'close', 'token')).rejects.toBe(conflict)
  })
})

describe('fight recording data', () => {
  it('requests and confirms the upload of a retained recording through the API', async () => {
    const target = { url: 'https://storage.invalid/upload', key: 'recordings/m1.webm' }
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(target))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    try {
      expect(await requestRecordingUpload('m1', 'video/webm', 25, 'jwt')).toEqual(target)
      await expect(
        confirmRecordingUpload('m1', { key: target.key, size: 25 }, 'jwt'),
      ).resolves.toBeUndefined()
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(/\/matches\/m1\/recording\/upload-url$/),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer jwt' }),
          body: JSON.stringify({ contentType: 'video/webm', size: 25 }),
        }),
      )
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(/\/matches\/m1\/recording\/complete$/),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer jwt' }),
          body: JSON.stringify({ key: target.key, size: 25 }),
        }),
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
