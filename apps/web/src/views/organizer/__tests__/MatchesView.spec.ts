import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

import type { Championship, MatchState, MatchSummary, Robot } from '@/types'
import MatchesView from '../MatchesView.vue'

vi.mock('@/mocks', () => ({
  getChampionship: vi.fn<(id: string) => Promise<Championship | null>>(),
  getMatchSummaries: vi.fn<(championshipId: string) => Promise<MatchSummary[]>>(),
  getRobots: vi.fn<(championshipId: string) => Promise<Robot[]>>(),
}))
import { getChampionship, getMatchSummaries, getRobots } from '@/mocks'

const stub = { render: () => null }
const base = { createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' }
const championship: Championship = { ...base, id: 'c1', name: 'Copa 2026', startDate: '2026-12-09' }
const robot = (id: string, name: string): Robot => ({
  ...base,
  id,
  championshipId: 'c1',
  name,
  team: 'Equipe',
  weightClass: 'lightweight',
})
const match = (
  id: string,
  robotAId: string,
  robotBId: string,
  state: MatchState,
): MatchSummary => ({
  ...base,
  id,
  championshipId: 'c1',
  weightClass: 'lightweight',
  robotAId,
  robotBId,
  state,
})

const robots = [
  robot('r1', 'Titã'),
  robot('r2', 'Nêmesis'),
  robot('r3', 'Marte'),
  robot('r4', 'Cobalto'),
]
const matches = [
  match('m1', 'r1', 'r2', 'waiting'),
  match('m2', 'r3', 'r4', 'running'),
  match('m3', 'r1', 'r3', 'paused'),
  match('m4', 'r2', 'r4', 'finished'),
]

async function mountView(path = '/manage/c1/matches') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/manage', name: 'my-championships', component: stub },
      {
        path: '/manage/:championshipId/matches',
        name: 'championship-matches',
        component: MatchesView,
        props: true,
      },
      { path: '/manage/:championshipId/matches/new', name: 'match-create', component: stub },
      {
        path: '/manage/:championshipId/matches/:matchId/edit',
        name: 'match-edit',
        component: stub,
      },
    ],
  })
  await router.push(path)
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

type Wrapper = Awaited<ReturnType<typeof mountView>>['wrapper']

const pairs = (wrapper: Wrapper) =>
  wrapper.findAll('tbody th').map((th) =>
    th
      .findAll('.matches__name')
      .map((name) => name.text())
      .join(' × '),
  )
const tab = (wrapper: Wrapper, label: string) =>
  wrapper.findAll('[role="tab"]').find((t) => t.text() === label)!

describe('MatchesView', () => {
  beforeEach(() => {
    vi.mocked(getChampionship).mockReset().mockResolvedValue(championship)
    vi.mocked(getMatchSummaries).mockReset().mockResolvedValue(matches)
    vi.mocked(getRobots).mockReset().mockResolvedValue(robots)
  })

  it('lists every match with robot names, status and the count', async () => {
    const { wrapper } = await mountView()

    expect(pairs(wrapper)).toEqual([
      'Titã × Nêmesis',
      'Marte × Cobalto',
      'Titã × Marte',
      'Nêmesis × Cobalto',
    ])
    const statuses = wrapper.findAll('tbody tr').map((tr) => tr.findAll('td')[0]!.text())
    expect(statuses).toEqual(['Programada', 'Em andamento', 'Em andamento', 'Encerrada'])
    expect(wrapper.text()).toContain('4 lutas · montadas manualmente, sem chaveamento automático.')
    expect(wrapper.findAll('nav li:not([aria-hidden])').map((li) => li.text())).toEqual([
      'Meus campeonatos',
      'Copa 2026',
      'Lutas',
    ])
  })

  it('keeps explicit table roles so the reflowing rows stay a table for assistive tech', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.get('table').attributes('role')).toBe('table')
    expect(wrapper.findAll('[role="columnheader"]').map((th) => th.text())).toEqual([
      'Confronto',
      'Status',
      'Ações',
    ])
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      expect(row.attributes('role')).toBe('row')
      expect(row.findAll('[role="rowheader"]')).toHaveLength(1)
      expect(row.findAll('[role="cell"]')).toHaveLength(2)
    }
  })

  it('offers Editar only on scheduled matches, and Criar luta', async () => {
    const { wrapper } = await mountView()
    const edits = wrapper.findAll('a').filter((a) => a.text() === 'Editar')

    expect(edits).toHaveLength(1)
    expect(edits[0]!.attributes('href')).toBe('/manage/c1/matches/m1/edit')
    expect(edits[0]!.attributes('aria-label')).toBe('Editar luta Titã contra Nêmesis')
    expect(
      wrapper
        .findAll('a')
        .find((a) => a.text() === 'Criar luta')!
        .attributes('href'),
    ).toBe('/manage/c1/matches/new')
    expect(wrapper.text()).not.toContain('Abrir operação')
    expect(wrapper.text()).not.toContain('Preparar')
  })

  it('filters by tab and keeps the tab in the query', async () => {
    const { wrapper, router } = await mountView()

    await tab(wrapper, 'Programadas').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.state).toBe('waiting')
    expect(pairs(wrapper)).toEqual(['Titã × Nêmesis'])

    await tab(wrapper, 'Em andamento').trigger('click')
    await flushPromises()
    expect(pairs(wrapper)).toEqual(['Marte × Cobalto', 'Titã × Marte'])

    await tab(wrapper, 'Encerradas').trigger('click')
    await flushPromises()
    expect(pairs(wrapper)).toEqual(['Nêmesis × Cobalto'])

    await tab(wrapper, 'Todas').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.state).toBeUndefined()
    expect(pairs(wrapper)).toHaveLength(4)
  })

  it('restores the tab from the query and ignores unknown values', async () => {
    const running = await mountView('/manage/c1/matches?state=running')
    expect(tab(running.wrapper, 'Em andamento').attributes('aria-selected')).toBe('true')

    const bogus = await mountView('/manage/c1/matches?state=bogus')
    expect(tab(bogus.wrapper, 'Todas').attributes('aria-selected')).toBe('true')
  })

  it('shows empty states', async () => {
    vi.mocked(getMatchSummaries).mockResolvedValue([matches[0]!])
    const { wrapper } = await mountView('/manage/c1/matches?state=finished')
    expect(wrapper.text()).toContain('Nenhuma luta encerrada.')

    vi.mocked(getMatchSummaries).mockResolvedValue([])
    const empty = await mountView()
    expect(empty.wrapper.text()).toContain('Nenhuma luta ainda.')
    expect(empty.wrapper.find('[role="tablist"]').exists()).toBe(false)
  })

  it('shows not found for an unknown championship', async () => {
    vi.mocked(getChampionship).mockResolvedValue(null)
    const { wrapper } = await mountView('/manage/nope/matches')

    expect(wrapper.text()).toContain('Campeonato não encontrado.')
    expect(getMatchSummaries).not.toHaveBeenCalled()
  })

  it('shows a retry panel when loading fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getMatchSummaries).mockRejectedValueOnce(new Error('boom'))
    const { wrapper } = await mountView()

    expect(wrapper.get('[role="alert"]').text()).toContain('Não foi possível carregar as lutas.')
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()

    expect(pairs(wrapper)).toHaveLength(4)
    error.mockRestore()
  })
})
