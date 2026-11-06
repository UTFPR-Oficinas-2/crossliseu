import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import type * as championshipsApi from '@/api/championships'
import type * as matchesApi from '@/api/matches'
import type * as robotsApi from '@/api/robots'

vi.mock('@/api/championships', () => ({
  listChampionships: vi.fn<typeof championshipsApi.listChampionships>(),
  getChampionship: vi.fn<typeof championshipsApi.getChampionship>(),
  createChampionship: vi.fn<typeof championshipsApi.createChampionship>(),
  updateChampionship: vi.fn<typeof championshipsApi.updateChampionship>(),
}))
vi.mock('@/api/robots', () => ({
  listRobots: vi.fn<typeof robotsApi.listRobots>(),
  createRobot: vi.fn<typeof robotsApi.createRobot>(),
  updateRobot: vi.fn<typeof robotsApi.updateRobot>(),
  deleteRobot: vi.fn<typeof robotsApi.deleteRobot>(),
}))
vi.mock('@/api/matches', () => ({
  listMatches: vi.fn<typeof matchesApi.listMatches>(),
  createMatch: vi.fn<typeof matchesApi.createMatch>(),
  updateMatch: vi.fn<typeof matchesApi.updateMatch>(),
  deleteMatch: vi.fn<typeof matchesApi.deleteMatch>(),
}))

import { getChampionship as fetchChampionship } from '@/api/championships'
import { createMatch as postMatch, listMatches, type ApiMatch } from '@/api/matches'
import { createRobot as postRobot, listRobots, type ApiRobot } from '@/api/robots'
import {
  createMatch,
  createRobot,
  getArenas,
  getChampionship,
  getMatch,
  getMatchSummaries,
  getRefereeAccess,
  getRobots,
} from '@/data'

const createdAt = '2026-10-01T00:00:00.000Z'
const modifiedAt = '2026-10-02T00:00:00.000Z'

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

const apiMatch: ApiMatch = {
  id: 'm1',
  championshipId: 'c1',
  weightClass: 'beetleweight',
  state: 'paused',
  scheduledAt: '2026-12-09T13:00:00.000Z',
  startedAt: '2026-12-09T13:01:00.000Z',
  finishedAt: null,
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

  it('rejects data the API does not provide yet instead of serving demo data', async () => {
    await expect(getArenas('c1')).rejects.toMatchObject({ status: 501, message: 'not_implemented' })
    await expect(getMatch('m1')).rejects.toMatchObject({ status: 501 })
    await expect(getRefereeAccess('token')).rejects.toMatchObject({ status: 501 })
  })
})
