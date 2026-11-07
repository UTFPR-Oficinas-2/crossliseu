import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

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

async function mountAt(path: string) {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/manage/:championshipId/matches', name: 'championship-matches', component: stub },
      {
        path: '/operator',
        component: OperatorLayout,
        children: [
          { path: '', name: 'operator', component: stub },
          { path: ':matchId', name: 'match-operation', component: stub },
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

  it('reports the arena as connected when its box is online', async () => {
    vi.mocked(getArenas).mockResolvedValue([{ ...arenas[1]!, online: true }])

    const wrapper = await mountAt('/operator/m1')

    expect(wrapper.findComponent(OperatorNav).props('arenaConnected')).toBe(true)
  })

  it('loads nothing on the picker route', async () => {
    const wrapper = await mountAt('/operator')

    expect(getMatchSummary).not.toHaveBeenCalled()
    expect(wrapper.findComponent(OperatorNav).exists()).toBe(false)
  })
})
