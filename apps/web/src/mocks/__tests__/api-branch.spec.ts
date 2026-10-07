import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as matchesApi from '@/api/matches'
import type * as robotsApi from '@/api/robots'

// Pretend VITE_API_URL is set so `@/mocks` takes its API branches
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  isApiEnabled: true,
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

import { createMatch as postMatch, listMatches, type ApiMatch } from '@/api/matches'
import { createRobot as postRobot, listRobots, type ApiRobot } from '@/api/robots'
import { createMatch, createRobot, getMatchSummaries, getRobots } from '@/mocks'

const createdAt = '2026-10-01T00:00:00.000Z'
const modifiedAt = '2026-10-02T00:00:00.000Z'

const apiRobot: ApiRobot = {
  id: 'r1',
  championshipId: 'c1',
  name: 'Titã',
  team: 'Equipe Volt',
  weightClass: 'lightweight',
  createdAt,
  modifiedAt,
  deletedAt: null,
}

const apiMatch: ApiMatch = {
  id: 'm1',
  championshipId: 'c1',
  weightClass: 'lightweight',
  status: 'paused',
  robotAId: 'r1',
  robotBId: 'r2',
  robotA: apiRobot,
  createdAt,
  modifiedAt,
  deletedAt: null,
}

describe('@/mocks with the API configured', () => {
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
        weightClass: 'lightweight',
        createdAt,
        modifiedAt,
      },
    ])
    expect(listRobots).toHaveBeenCalledWith('c1')
  })

  it('maps match status to state and drops the embedded robots', async () => {
    vi.mocked(listMatches).mockResolvedValue([apiMatch])

    expect(await getMatchSummaries('c1')).toEqual([
      {
        id: 'm1',
        championshipId: 'c1',
        weightClass: 'lightweight',
        robotAId: 'r1',
        robotBId: 'r2',
        state: 'paused',
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
      { name: 'Titã', team: 'Equipe Volt', weightClass: 'lightweight' },
      'tok',
    )
    await createMatch('c1', { robotAId: 'r1', robotBId: 'r2' }, 'tok')

    expect(postRobot).toHaveBeenCalledWith(
      { name: 'Titã', team: 'Equipe Volt', weightClass: 'lightweight', championshipId: 'c1' },
      'tok',
    )
    expect(postMatch).toHaveBeenCalledWith(
      { robotAId: 'r1', robotBId: 'r2', championshipId: 'c1' },
      'tok',
    )
  })
})
