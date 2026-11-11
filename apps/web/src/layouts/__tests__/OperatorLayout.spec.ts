import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type RouteComponent } from 'vue-router'

import AppNav from '@/components/ui/AppNav.vue'
import OperatorNav from '@/components/ui/OperatorNav.vue'
import { TOKEN_STORAGE_KEY } from '@/stores/auth'
import { liveToken } from '@/stores/__tests__/token-helpers'
import type { Arena, Championship, MatchSummary, Robot } from '@/types'
import OperatorLayout from '../OperatorLayout.vue'

vi.mock('@/data', () => ({
  getMatchSummary: vi.fn<(id: string) => Promise<MatchSummary | null>>(),
  getArenas: vi.fn<(token: string) => Promise<Arena[]>>(),
  getChampionship: vi.fn<(id: string) => Promise<Championship | null>>(),
  getRobots: vi.fn<(championshipId: string) => Promise<Robot[]>>(),
}))
import { getArenas, getChampionship, getMatchSummary, getRobots } from '@/data'

const stub = { render: () => null }
const token = liveToken()
const at = '2026-10-01T00:00:00.000Z'

const match: MatchSummary = {
  id: 'm1',
  championshipId: 'c1',
  weightClass: 'beetleweight',
  robotAId: 'r1',
  robotBId: 'r2',
  arenaId: null,
  state: 'scheduled',
  scheduledAt: at,
  createdAt: at,
  modifiedAt: at,
}
const arenas: Arena[] = [
  { id: 'a0', name: 'Arena 0', online: true, currentMatchId: null, currentMatch: null },
  {
    id: 'a1',
    name: 'Arena 1',
    online: false,
    currentMatchId: 'm1',
    currentMatch: { robotAName: 'Titã', robotBName: 'Marte' },
  },
]
const robot = (id: string, name: string): Robot => ({
  id,
  championshipId: 'c1',
  name,
  team: 'Volt',
  weightClass: 'beetleweight',
  createdAt: at,
  modifiedAt: at,
})

async function mountAt(path: string, operation: RouteComponent = stub) {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: stub },
      { path: '/manage', name: 'my-championships', component: stub },
      { path: '/manage/:championshipId/matches', name: 'championship-matches', component: stub },
      {
        path: '/operator',
        component: OperatorLayout,
        children: [
          { path: '', name: 'operator', component: stub },
          { path: ':matchId', name: 'match-operation', component: operation },
        ],
      },
    ],
  })
  await router.push(path)
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('OperatorLayout', () => {
  enableAutoUnmount(afterEach)

  beforeEach(() => {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
    vi.mocked(getMatchSummary).mockReset().mockResolvedValue(match)
    vi.mocked(getArenas).mockReset().mockResolvedValue(arenas)
    vi.mocked(getChampionship)
      .mockReset()
      .mockResolvedValue({ id: 'c1', name: 'Copa', startDate: null, createdAt: at, modifiedAt: at })
    vi.mocked(getRobots)
      .mockReset()
      .mockResolvedValue([robot('r1', 'Titã'), robot('r2', 'Marte')])
  })

  it('rebuilds the arena of the fight from the server after a reload', async () => {
    const wrapper = await mountAt('/operator/m1')

    expect(getMatchSummary).toHaveBeenCalledWith('m1')
    expect(getArenas).toHaveBeenCalledWith(token)
    expect(wrapper.findComponent(OperatorNav).props()).toMatchObject({
      arena: 'Arena 1',
      championship: 'Copa',
      robotA: 'Titã',
      robotB: 'Marte',
      arenaConnected: false,
    })
    expect(wrapper.find('[aria-current="step"]').text()).toBe('1 · Preparação')
  })

  it('updates the current step when the operator view observes a new fight status', async () => {
    const wrapper = await mountAt('/operator/m1', {
      template: `<button @click="$emit('fight-status', 'm1', 'finished')">Finish</button>`,
    })
    await wrapper.get('main button').trigger('click')

    expect(wrapper.get('[aria-current="step"]').text()).toBe('3 · Encerramento')
  })

  it('refreshes the assigned arena and its connectivity while staying on the same fight', async () => {
    const wrapper = await mountAt('/operator/m1', {
      template: `<button @click="$emit('fight-status', 'm1', 'scheduled', true)">Poll</button>`,
    })
    expect(wrapper.getComponent(OperatorNav).props('arena')).toBe('Arena 1')

    vi.mocked(getArenas).mockResolvedValueOnce([
      { ...arenas[1]!, id: 'a2', name: 'Arena 2', online: true },
    ])
    await wrapper.get('main button').trigger('click')
    await flushPromises()

    expect(wrapper.getComponent(OperatorNav).props()).toMatchObject({
      arena: 'Arena 2',
      arenaConnected: true,
    })
  })

  it('clears the arena name and connection badge when the latest snapshot loses the assignment', async () => {
    const wrapper = await mountAt('/operator/m1', {
      template: `<button @click="$emit('fight-status', 'm1', 'scheduled', false)">Poll</button>`,
    })
    expect(wrapper.getComponent(OperatorNav).props('arena')).toBe('Arena 1')
    await wrapper.get('main button').trigger('click')
    await flushPromises()

    expect(wrapper.getComponent(OperatorNav).props('arena')).toBe('')
    expect(wrapper.text()).not.toContain('Arena não conectada')
  })

  it('finds the arena by arenaId after Close cleared its current match', async () => {
    vi.mocked(getMatchSummary).mockResolvedValue({ ...match, state: 'finished', arenaId: 'a1' })
    vi.mocked(getArenas).mockResolvedValue([
      arenas[0]!,
      { ...arenas[1]!, currentMatchId: null, currentMatch: null },
    ])

    const wrapper = await mountAt('/operator/m1')

    expect(wrapper.findComponent(OperatorNav).props('arena')).toBe('Arena 1')
  })

  it('falls back to currentMatchId before Start', async () => {
    const wrapper = await mountAt('/operator/m1')

    expect(wrapper.findComponent(OperatorNav).props('arena')).toBe('Arena 1')
  })

  it('shows no arena when arenaId is null and no arena points at the match', async () => {
    vi.mocked(getArenas).mockResolvedValue([arenas[0]!])

    const wrapper = await mountAt('/operator/m1')

    expect(wrapper.findComponent(OperatorNav).props('arena')).toBe('')
  })

  it('reports the arena as connected when its box is online', async () => {
    vi.mocked(getArenas).mockResolvedValue([{ ...arenas[1]!, online: true }])

    const wrapper = await mountAt('/operator/m1')

    expect(wrapper.findComponent(OperatorNav).props('arenaConnected')).toBe(true)
  })

  it('keeps the fight when only the arenas fail to load', async () => {
    vi.mocked(getArenas).mockRejectedValue(new Error('network'))

    const wrapper = await mountAt('/operator/m1')

    expect(wrapper.findComponent(OperatorNav).props()).toMatchObject({
      arena: '',
      championship: 'Copa',
      robotA: 'Titã',
      robotB: 'Marte',
      arenaConnected: false,
    })
    expect(wrapper.find('[aria-current="step"]').text()).toBe('1 · Preparação')
  })

  it('loads nothing on the picker route', async () => {
    const wrapper = await mountAt('/operator')

    expect(getMatchSummary).not.toHaveBeenCalled()
    expect(wrapper.findComponent(OperatorNav).exists()).toBe(false)
  })

  it('shows the app navigation on the picker route, with Operação current', async () => {
    const wrapper = await mountAt('/operator')

    expect(wrapper.findComponent(AppNav).exists()).toBe(true)
    expect(wrapper.find('a[aria-current="page"]').text()).toBe('Operação')
  })

  it('keeps the operator navigation, not the app one, while running a fight', async () => {
    const wrapper = await mountAt('/operator/m1')

    expect(wrapper.findComponent(AppNav).exists()).toBe(false)
  })
})
