import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import {
  createChampionship,
  createMatch,
  createRobot,
  deleteMatch,
  deleteRobot,
  getMatchSummaries,
  getRobots,
  updateMatch,
  updateRobot,
  type RobotInput,
} from '@/mocks'
import { matchId } from '@/mocks/data'

// Demo data is a module-level singleton: each test works in its own championship
async function newChampionship() {
  const { id } = await createChampionship(
    { name: 'Copa Teste', startDate: '2026-01-01', endDate: '2026-01-02' },
    't',
  )
  return id
}

const tita: RobotInput = { name: 'Titã', team: 'Equipe Volt', weightClass: 'lightweight' }
const marte: RobotInput = { name: 'Marte', team: 'Equipe Órbita', weightClass: 'lightweight' }
const aco: RobotInput = { name: 'Aço', team: 'Equipe Aço', weightClass: 'lightweight' }
const bigorna: RobotInput = { name: 'Bigorna', team: 'Equipe Bigorna', weightClass: 'heavyweight' }

const rejection = (status: number, code: string) => ({ status, details: [code] })

async function championshipWithRobots() {
  const id = await newChampionship()
  const a = await createRobot(id, tita, 't')
  const b = await createRobot(id, marte, 't')
  const c = await createRobot(id, aco, 't')
  const heavy = await createRobot(id, bigorna, 't')
  return { id, a, b, c, heavy }
}

describe('demo robot writes', () => {
  it('normalizes names and teams and lists robots in registration order', async () => {
    const id = await newChampionship()
    await createRobot(
      id,
      { name: '  Titã ', team: 'Equipe   Volt', weightClass: 'lightweight' },
      't',
    )
    await createRobot(id, marte, 't')

    expect((await getRobots(id)).map((r) => [r.name, r.team, r.weightClass])).toEqual([
      ['Titã', 'Equipe Volt', 'lightweight'],
      ['Marte', 'Equipe Órbita', 'lightweight'],
    ])
  })

  it('rejects a name already used in the championship, ignoring case and spaces', async () => {
    const id = await newChampionship()
    await createRobot(id, tita, 't')

    await expect(createRobot(id, { ...marte, name: ' TITÃ ' }, 't')).rejects.toMatchObject(
      rejection(409, 'robot_name_taken'),
    )
  })

  it('allows the same name in another championship and lets a robot keep its name', async () => {
    const first = await newChampionship()
    const second = await newChampionship()
    const robot = await createRobot(first, tita, 't')

    await expect(createRobot(second, tita, 't')).resolves.toMatchObject({ name: 'Titã' })
    await expect(updateRobot(robot.id, { ...tita, name: 'titã' }, 't')).resolves.toMatchObject({
      name: 'titã',
    })
  })

  it('rejects an unknown championship or robot', async () => {
    await expect(createRobot('missing', tita, 't')).rejects.toMatchObject(
      rejection(404, 'championship_not_found'),
    )
    await expect(updateRobot('missing', tita, 't')).rejects.toMatchObject(
      rejection(404, 'robot_not_found'),
    )
    await expect(deleteRobot('missing', 't')).rejects.toBeInstanceOf(ApiError)
  })

  it('keeps a robot that is in a match from being removed or reclassed', async () => {
    const { id, a, b } = await championshipWithRobots()
    await createMatch(id, { robotAId: a.id, robotBId: b.id }, 't')

    await expect(deleteRobot(a.id, 't')).rejects.toMatchObject(rejection(409, 'robot_has_matches'))
    await expect(
      updateRobot(a.id, { ...tita, weightClass: 'heavyweight' }, 't'),
    ).rejects.toMatchObject(rejection(409, 'robot_has_matches'))
    await expect(updateRobot(a.id, { ...tita, team: 'Equipe Nova' }, 't')).resolves.toMatchObject({
      team: 'Equipe Nova',
    })
  })

  it('removes a robot without matches', async () => {
    const id = await newChampionship()
    const robot = await createRobot(id, tita, 't')

    await deleteRobot(robot.id, 't')

    expect(await getRobots(id)).toEqual([])
  })
})

describe('demo match writes', () => {
  it('creates a waiting match with the weight class of its robots', async () => {
    const { id, a, b } = await championshipWithRobots()

    const created = await createMatch(id, { robotAId: a.id, robotBId: b.id }, 't')

    expect(created).toMatchObject({
      championshipId: id,
      robotAId: a.id,
      robotBId: b.id,
      weightClass: 'lightweight',
      state: 'waiting',
    })
    expect(await getMatchSummaries(id)).toEqual([created])
  })

  it('rejects like the API', async () => {
    const { id, a, heavy } = await championshipWithRobots()
    const outsider = await createRobot(await newChampionship(), tita, 't')

    await expect(createMatch(id, { robotAId: a.id, robotBId: a.id }, 't')).rejects.toMatchObject(
      rejection(400, 'match_robots_must_differ'),
    )
    await expect(
      createMatch(id, { robotAId: a.id, robotBId: heavy.id }, 't'),
    ).rejects.toMatchObject(rejection(400, 'match_weight_class_mismatch'))
    await expect(
      createMatch(id, { robotAId: a.id, robotBId: outsider.id }, 't'),
    ).rejects.toMatchObject(rejection(400, 'robot_not_in_championship'))
    await expect(
      createMatch(id, { robotAId: a.id, robotBId: 'missing' }, 't'),
    ).rejects.toMatchObject(rejection(404, 'robot_not_found'))
  })

  it('edits and deletes a waiting match', async () => {
    const { id, a, b, c } = await championshipWithRobots()
    const created = await createMatch(id, { robotAId: a.id, robotBId: b.id }, 't')

    await expect(
      updateMatch(created.id, { robotAId: a.id, robotBId: c.id }, 't'),
    ).resolves.toMatchObject({ robotBId: c.id, weightClass: 'lightweight' })
    await deleteMatch(created.id, 't')

    expect(await getMatchSummaries(id)).toEqual([])
  })

  it('refuses to edit or delete a match that is no longer waiting', async () => {
    // Fight 07 in the demo data is running
    const running = matchId(7)

    await expect(updateMatch(running, { robotAId: 'x', robotBId: 'y' }, 't')).rejects.toMatchObject(
      rejection(409, 'match_not_editable'),
    )
    await expect(deleteMatch(running, 't')).rejects.toMatchObject(
      rejection(409, 'match_not_editable'),
    )
  })
})
