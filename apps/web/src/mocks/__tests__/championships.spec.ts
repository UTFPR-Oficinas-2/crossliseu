import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import {
  createChampionship,
  getChampionship,
  getManagedChampionships,
  updateChampionship,
} from '@/mocks'

describe('demo championship writes', () => {
  it('creates a managed championship with zero counts and a date-derived status', async () => {
    const created = await createChampionship(
      { name: 'Copa Teste', startDate: '2001-01-01', endDate: '2001-01-02' },
      'token',
    )
    expect(created).toMatchObject({
      name: 'Copa Teste',
      status: 'finished',
      robotCount: 0,
      fightsDone: 0,
      fightsTotal: 0,
    })
    expect((await getManagedChampionships()).map((c) => c.id)).toContain(created.id)
    expect(await getChampionship(created.id)).toMatchObject({ name: 'Copa Teste' })
  })

  it('updates name, dates and status in place', async () => {
    const { id } = await createChampionship(
      { name: 'A', startDate: '2001-01-01', endDate: '2001-01-01' },
      't',
    )
    const updated = await updateChampionship(
      id,
      { name: 'B', startDate: '2999-01-01', endDate: '2999-01-02' },
      't',
    )
    expect(updated).toMatchObject({
      id,
      name: 'B',
      startDate: '2999-01-01',
      endDate: '2999-01-02',
      status: 'scheduled',
    })
    expect(await getChampionship(id)).toMatchObject({ name: 'B' })
  })

  it('rejects like the API', async () => {
    await expect(
      createChampionship({ name: 'X', startDate: '2026-01-02', endDate: '2026-01-01' }, 't'),
    ).rejects.toMatchObject({ status: 400, details: ['championship_end_before_start'] })
    await expect(
      updateChampionship(
        '6f1c2a40-0001-4000-8000-0000000000ff',
        { name: 'X', startDate: '2026-01-01', endDate: '2026-01-01' },
        't',
      ),
    ).rejects.toBeInstanceOf(ApiError)
  })
})
