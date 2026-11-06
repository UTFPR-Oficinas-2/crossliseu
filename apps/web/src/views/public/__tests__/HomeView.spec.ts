import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

import type { Championship } from '@/types'
import HomeView from '../HomeView.vue'

vi.mock('@/data', () => ({ getChampionships: vi.fn<() => Promise<Championship[]>>() }))
import { getChampionships } from '@/data'

const base = { createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' }
const championship = (id: string, status: Championship['status']): Championship => ({
  ...base,
  id,
  name: `Copa ${id}`,
  status,
  startDate: '2026-12-09',
  fightsDone: 0,
  fightsTotal: 4,
})

async function mountView(path = '/') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'home', component: HomeView }],
  })
  await router.push(path)
  const replace = vi.spyOn(router, 'replace')
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router, replace }
}

type Wrapper = Awaited<ReturnType<typeof mountView>>['wrapper']

const tab = (wrapper: Wrapper, label: string) =>
  wrapper.findAll('[role="tab"]').find((t) => t.text() === label)!
const activeTab = (wrapper: Wrapper) =>
  wrapper.findAll('[role="tab"]').find((t) => t.attributes('aria-selected') === 'true')?.text()

describe('HomeView', () => {
  beforeEach(() => {
    vi.mocked(getChampionships).mockReset()
    vi.mocked(getChampionships).mockResolvedValue([
      championship('a', 'ongoing'),
      championship('b', 'scheduled'),
      championship('c', 'closed'),
    ])
  })

  it('has no live fight block', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.find('[aria-label="Luta ao vivo"]').exists()).toBe(false)
  })

  it('shows only the title in the hero', async () => {
    const { wrapper } = await mountView()
    const hero = wrapper.get('.home__hero')

    expect(hero.get('h1').text()).toBe('Acompanhe a arena')
    expect(hero.findAll('p')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Robótica em combate')
  })

  it('keeps the chosen filter in ?status=', async () => {
    const { wrapper, replace } = await mountView()

    await tab(wrapper, 'Encerrados').trigger('click')

    expect(replace).toHaveBeenCalledWith({ query: { status: 'closed' } })
  })

  it('opens on the filter from the query', async () => {
    const { wrapper } = await mountView('/?status=closed')

    expect(activeTab(wrapper)).toBe('Encerrados')
    expect(wrapper.text()).toContain('Copa c')
    expect(wrapper.text()).not.toContain('Copa a')
  })

  it('falls back to Em andamento for an unknown or legacy value', async () => {
    const { wrapper } = await mountView('/?status=running')

    expect(activeTab(wrapper)).toBe('Em andamento')
  })
})
