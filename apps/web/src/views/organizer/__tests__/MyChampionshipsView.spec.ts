import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

import type { Championship } from '@/types'
import MyChampionshipsView from '../MyChampionshipsView.vue'

vi.mock('@/mocks', () => ({ getManagedChampionships: vi.fn<() => Promise<Championship[]>>() }))
import { getManagedChampionships } from '@/mocks'

const stub = { render: () => null }

const base = { createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' }
const fixture: Championship[] = [
  {
    ...base,
    id: 'c1',
    name: 'Copa Andamento',
    status: 'running',
    startDate: '2026-10-04',
    endDate: '2026-10-06',
    robotCount: 16,
    fightsDone: 6,
    fightsTotal: 15,
  },
  {
    ...base,
    id: 'c2',
    name: 'Copa Programada',
    status: 'scheduled',
    startDate: '2026-12-09',
    robotCount: 8,
    fightsDone: 0,
    fightsTotal: 7,
  },
  {
    ...base,
    id: 'c3',
    name: 'Copa Encerrada',
    status: 'finished',
    startDate: '2025-12-10',
    robotCount: 16,
    fightsDone: 15,
    fightsTotal: 15,
  },
]

async function mountView(path = '/manage') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/manage', name: 'my-championships', component: MyChampionshipsView },
      { path: '/manage/new', name: 'championship-create', component: stub },
      { path: '/manage/:championshipId', name: 'championship-overview', component: stub },
      { path: '/championships/:championshipId', name: 'championship', component: stub },
    ],
  })
  await router.push(path)
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

type Wrapper = Awaited<ReturnType<typeof mountView>>['wrapper']

const tab = (wrapper: Wrapper, label: string) =>
  wrapper.findAll('[role="tab"]').find((t) => t.text() === label)!
const rowNames = (wrapper: Wrapper) => wrapper.findAll('li h2').map((h) => h.text())

describe('MyChampionshipsView', () => {
  beforeEach(() => {
    vi.mocked(getManagedChampionships).mockReset()
    vi.mocked(getManagedChampionships).mockResolvedValue(fixture)
  })

  it('renders a row per championship and a pluralised subtitle', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.findAll('li')).toHaveLength(3)
    expect(wrapper.text()).toContain('Você tem permissão para gerenciar 3 campeonatos.')

    vi.mocked(getManagedChampionships).mockResolvedValue([fixture[0]!])
    const single = await mountView()
    expect(single.wrapper.text()).toContain('Você tem permissão para gerenciar 1 campeonato.')
  })

  it('highlights Gerenciar only for the running row and links to the public page', async () => {
    const { wrapper } = await mountView()
    const rows = wrapper.findAll('li')

    const manage = rows.map((r) => r.findAll('a').find((a) => a.text() === 'Gerenciar')!)
    expect(manage[0]!.classes()).toContain('app-button--primary')
    expect(manage[1]!.classes()).toContain('app-button--secondary')
    expect(manage[2]!.classes()).toContain('app-button--secondary')
    expect(manage[0]!.attributes('href')).toBe('/manage/c1')

    const pub = rows[0]!.findAll('a').find((a) => a.text() === 'Ver pública')!
    expect(pub.classes()).toContain('app-button--ghost')
    expect(pub.attributes('href')).toBe('/championships/c1')
  })

  it('filters by tab, keeps the filter in the query and hides scheduled rows', async () => {
    const { wrapper, router } = await mountView()

    await tab(wrapper, 'Encerrados').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.status).toBe('finished')
    expect(rowNames(wrapper)).toEqual(['Copa Encerrada'])

    await tab(wrapper, 'Em andamento').trigger('click')
    await flushPromises()
    expect(rowNames(wrapper)).toEqual(['Copa Andamento'])

    await tab(wrapper, 'Todos').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.status).toBeUndefined()
    expect(rowNames(wrapper)).toHaveLength(3)
  })

  it('restores the filter from the query and ignores unknown values', async () => {
    const running = await mountView('/manage?status=running')
    expect(tab(running.wrapper, 'Em andamento').attributes('aria-selected')).toBe('true')
    expect(rowNames(running.wrapper)).toEqual(['Copa Andamento'])

    const bogus = await mountView('/manage?status=bogus')
    expect(tab(bogus.wrapper, 'Todos').attributes('aria-selected')).toBe('true')
  })

  it('shows empty states', async () => {
    vi.mocked(getManagedChampionships).mockResolvedValue([fixture[2]!])
    const { wrapper } = await mountView('/manage?status=running')
    expect(wrapper.text()).toContain('Nenhum campeonato em andamento.')

    vi.mocked(getManagedChampionships).mockResolvedValue([])
    const empty = await mountView()
    expect(empty.wrapper.text()).toContain(
      'Nenhum campeonato ainda. Use "Criar campeonato" para começar.',
    )
    expect(empty.wrapper.find('[role="tablist"]').exists()).toBe(false)
  })

  it('shows an alert on failure and retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getManagedChampionships).mockRejectedValueOnce(new Error('boom'))
    const { wrapper } = await mountView()

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Não foi possível carregar os campeonatos.',
    )

    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(getManagedChampionships).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.findAll('li')).toHaveLength(3)
  })
})
