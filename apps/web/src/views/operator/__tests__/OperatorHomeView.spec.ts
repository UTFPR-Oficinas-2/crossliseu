import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import { TOKEN_STORAGE_KEY } from '@/stores/auth'
import { liveToken } from '@/stores/__tests__/token-helpers'
import type { Arena, Championship, MatchState, MatchSummary, Robot } from '@/types'
import OperatorHomeView from '../OperatorHomeView.vue'

vi.mock('@/data', () => ({
  getManagedChampionships: vi.fn<(token: string) => Promise<Championship[]>>(),
  getArenas: vi.fn<(token: string) => Promise<Arena[]>>(),
  getMatchSummaries: vi.fn<(championshipId: string) => Promise<MatchSummary[]>>(),
  getRobots: vi.fn<(championshipId: string) => Promise<Robot[]>>(),
  selectArenaMatch: vi.fn<(arenaId: string, matchId: string, token: string) => Promise<Arena>>(),
}))
import {
  getArenas,
  getManagedChampionships,
  getMatchSummaries,
  getRobots,
  selectArenaMatch,
} from '@/data'

const stub = { render: () => null }
const token = liveToken()
const at = '2026-10-01T00:00:00.000Z'

const championship = (id: string, name: string): Championship => ({
  id,
  name,
  startDate: null,
  createdAt: at,
  modifiedAt: at,
})
const robot = (id: string, name: string, team: string): Robot => ({
  id,
  championshipId: 'c1',
  name,
  team,
  weightClass: 'beetleweight',
  createdAt: at,
  modifiedAt: at,
})
const match = (id: string, state: MatchState, robotAId = 'r1', robotBId = 'r2'): MatchSummary => ({
  id,
  championshipId: 'c1',
  weightClass: 'beetleweight',
  robotAId,
  robotBId,
  state,
  scheduledAt: at,
  createdAt: at,
  modifiedAt: at,
})
const freeArena = (id: string, name: string, online = false): Arena => ({
  id,
  name,
  online,
  currentMatchId: null,
  currentMatch: null,
})

const arenas: Arena[] = [
  freeArena('a1', 'Arena 01'),
  freeArena('a2', 'Arena 02', true),
  {
    id: 'a3',
    name: 'Arena 03',
    online: true,
    currentMatchId: 'm3',
    currentMatch: { robotAName: 'Titã', robotBName: 'Nêmesis' },
  },
]

async function mountAt(path: string) {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/manage/arenas', name: 'arenas', component: stub },
      { path: '/operator', name: 'operator', component: OperatorHomeView },
      { path: '/operator/:matchId', name: 'match-operation', component: stub },
    ],
  })
  await router.push(path)
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}
type Wrapper = Awaited<ReturnType<typeof mountAt>>['wrapper']

const group = (w: Wrapper, legend: string) =>
  w.findAll('fieldset').find((f) => f.get('legend').text() === legend)!
const cards = (w: Wrapper, legend: string) => group(w, legend).findAll('label')
const card = (w: Wrapper, legend: string, title: string) =>
  cards(w, legend).find((c) => c.get('.choice-item__title').text() === title)!
const openButton = (w: Wrapper) => w.findAll('button').find((b) => b.text() === 'Abrir luta')!

async function choose(w: Wrapper, legend: string, title: string) {
  await card(w, legend, title).get('input').setValue(true)
  await flushPromises()
}

describe('OperatorHomeView', () => {
  enableAutoUnmount(afterEach)

  beforeEach(() => {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
    vi.mocked(getManagedChampionships)
      .mockReset()
      .mockResolvedValue([championship('c1', 'Copa Crossliseu 2026')])
    vi.mocked(getArenas).mockReset().mockResolvedValue(arenas)
    vi.mocked(getMatchSummaries)
      .mockReset()
      .mockResolvedValue([
        match('m1', 'scheduled'),
        match('m2', 'ongoing'),
        match('m4', 'finished'),
        match('m5', 'scheduled', 'r2', 'r1'),
      ])
    vi.mocked(getRobots)
      .mockReset()
      .mockResolvedValue([
        robot('r1', 'Marte', 'Equipe Órbita'),
        robot('r2', 'Cobalto', 'Equipe Ferro'),
      ])
    vi.mocked(selectArenaMatch).mockReset()
  })

  it('lists the arenas, marking offline ones without blocking them', async () => {
    const { wrapper } = await mountAt('/operator')

    expect(getArenas).toHaveBeenCalledWith(token)
    const offline = card(wrapper, '1 · Arena', 'Arena 01')
    expect(offline.text()).toContain('Não conectado')
    expect(offline.get('.status-pill').classes()).toContain('status-pill--danger')
    expect(offline.get('input').attributes('disabled')).toBeUndefined()
    expect(card(wrapper, '1 · Arena', 'Arena 02').text()).toContain('Conectado')
  })

  it('disables an arena that already has a fight and says which one', async () => {
    const { wrapper } = await mountAt('/operator')

    const busy = card(wrapper, '1 · Arena', 'Arena 03')
    expect(busy.get('input').attributes('disabled')).toBeDefined()
    expect(busy.text()).toContain('Ocupada com Titã × Nêmesis')
    expect(busy.text()).toContain('Em uso')
  })

  it("lists only the selected championship's scheduled fights", async () => {
    const { wrapper } = await mountAt('/operator')

    expect(getMatchSummaries).toHaveBeenCalledWith('c1')
    expect(cards(wrapper, '2 · Luta').map((c) => c.get('.choice-item__title').text())).toEqual([
      'Marte × Cobalto',
      'Cobalto × Marte',
    ])
    expect(card(wrapper, '2 · Luta', 'Marte × Cobalto').text()).toContain(
      'Equipe Órbita × Equipe Ferro · beetleweight',
    )
    expect(wrapper.text()).toContain('2 lutas programadas')
  })

  it('keeps "Abrir luta" disabled until an arena and a fight are chosen', async () => {
    const { wrapper } = await mountAt('/operator')

    expect(openButton(wrapper).attributes('disabled')).toBeDefined()
    await choose(wrapper, '1 · Arena', 'Arena 01')
    expect(openButton(wrapper).attributes('disabled')).toBeDefined()
    await choose(wrapper, '2 · Luta', 'Marte × Cobalto')
    expect(openButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('assigns the fight to the arena and opens its run view', async () => {
    vi.mocked(selectArenaMatch).mockResolvedValue({ ...arenas[0]!, currentMatchId: 'm1' })
    const { wrapper, router } = await mountAt('/operator')

    await choose(wrapper, '1 · Arena', 'Arena 01')
    expect(wrapper.text()).toContain('A luta fica na Arena 01 até você fechá-la.')
    await choose(wrapper, '2 · Luta', 'Marte × Cobalto')
    await openButton(wrapper).trigger('click')
    await flushPromises()

    expect(selectArenaMatch).toHaveBeenCalledWith('a1', 'm1', token)
    expect(router.currentRoute.value.fullPath).toBe('/operator/m1')
  })

  it('keeps the championship and arena in the URL so a reload restores them', async () => {
    vi.mocked(getManagedChampionships).mockResolvedValue([
      championship('c1', 'Copa Crossliseu 2026'),
      championship('c2', 'Copa de Inverno'),
    ])
    const { wrapper, router } = await mountAt('/operator?championshipId=c1&arenaId=a2')

    expect(getMatchSummaries).toHaveBeenCalledWith('c1')
    const selected = card(wrapper, '1 · Arena', 'Arena 02')
    expect((selected.get('input').element as HTMLInputElement).checked).toBe(true)

    await choose(wrapper, '1 · Arena', 'Arena 01')
    expect(router.currentRoute.value.query).toEqual({ championshipId: 'c1', arenaId: 'a1' })
  })

  it('ignores unknown or unusable ids in the URL', async () => {
    vi.mocked(getManagedChampionships).mockResolvedValue([
      championship('c1', 'Copa Crossliseu 2026'),
      championship('c2', 'Copa de Inverno'),
    ])
    const { wrapper } = await mountAt('/operator?championshipId=someone-else&arenaId=a3')

    expect(getMatchSummaries).not.toHaveBeenCalled()
    expect(wrapper.findAll('input:checked')).toHaveLength(0)
    expect(wrapper.text()).toContain('Escolha um campeonato.')
  })

  it('removes the ids it ignored from the URL', async () => {
    vi.mocked(getManagedChampionships).mockResolvedValue([
      championship('c1', 'Copa Crossliseu 2026'),
      championship('c2', 'Copa de Inverno'),
    ])
    const { router } = await mountAt('/operator?championshipId=someone-else&arenaId=a3')

    expect(router.currentRoute.value.query).toEqual({})
  })

  it('keeps the chosen fight in the URL so a reload restores it', async () => {
    const first = await mountAt('/operator')
    await choose(first.wrapper, '1 · Arena', 'Arena 01')
    await choose(first.wrapper, '2 · Luta', 'Marte × Cobalto')
    expect(first.router.currentRoute.value.query).toEqual({
      championshipId: 'c1',
      arenaId: 'a1',
      matchId: 'm1',
    })
    first.wrapper.unmount()

    const { wrapper, router } = await mountAt('/operator?championshipId=c1&arenaId=a1&matchId=m1')

    const fight = card(wrapper, '2 · Luta', 'Marte × Cobalto')
    expect((fight.get('input').element as HTMLInputElement).checked).toBe(true)
    expect(openButton(wrapper).attributes('disabled')).toBeUndefined()
    expect(router.currentRoute.value.query.matchId).toBe('m1')
  })

  it('ignores a fight in the URL that can no longer be picked', async () => {
    const { wrapper, router } = await mountAt('/operator?championshipId=c1&arenaId=a1&matchId=m2')

    expect(wrapper.findAll('input[name="fight"]:checked')).toHaveLength(0)
    expect(router.currentRoute.value.query).toEqual({ championshipId: 'c1', arenaId: 'a1' })
  })

  it('starts over when the Operação link is followed from the picker', async () => {
    vi.mocked(getManagedChampionships).mockResolvedValue([
      championship('c1', 'Copa Crossliseu 2026'),
      championship('c2', 'Copa de Inverno'),
    ])
    const { wrapper, router } = await mountAt('/operator?championshipId=c1&arenaId=a2')
    await choose(wrapper, '2 · Luta', 'Marte × Cobalto')

    await router.push('/operator')
    await flushPromises()

    expect(wrapper.findAll('input:checked')).toHaveLength(0)
    expect(wrapper.text()).toContain('Escolha um campeonato.')
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('keeps the fights listed while it rechecks them after a refused pick', async () => {
    vi.mocked(selectArenaMatch).mockRejectedValue(
      new ApiError(409, 'arena_match_started', ['arena_match_started']),
    )
    const { wrapper } = await mountAt('/operator')
    await choose(wrapper, '1 · Arena', 'Arena 01')
    await choose(wrapper, '2 · Luta', 'Marte × Cobalto')
    let release!: (value: MatchSummary[]) => void
    vi.mocked(getMatchSummaries).mockReturnValueOnce(new Promise((resolve) => (release = resolve)))

    await openButton(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('Carregando lutas…')
    expect(cards(wrapper, '2 · Luta')).toHaveLength(2)
    release([match('m1', 'scheduled')])
    await flushPromises()
    expect(cards(wrapper, '2 · Luta')).toHaveLength(1)
  })

  it('marks a fight already open on another arena and blocks it', async () => {
    vi.mocked(getArenas).mockResolvedValue([
      freeArena('a1', 'Arena 01'),
      { ...freeArena('a2', 'Arena 02'), currentMatchId: 'm1' },
    ])
    const { wrapper } = await mountAt('/operator')

    const held = card(wrapper, '2 · Luta', 'Marte × Cobalto')
    expect(held.text()).toContain('Aberta na Arena 02')
    expect(held.get('input').attributes('disabled')).toBeDefined()
  })

  it('explains a refused pick and stays on the picker', async () => {
    vi.mocked(selectArenaMatch).mockRejectedValue(
      new ApiError(409, 'arena_match_started', ['arena_match_started']),
    )
    const { wrapper, router } = await mountAt('/operator')

    await choose(wrapper, '1 · Arena', 'Arena 01')
    await choose(wrapper, '2 · Luta', 'Marte × Cobalto')
    await openButton(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Esta arena já tem uma luta iniciada. Retome-a ou encerre-a antes.',
    )
    expect(router.currentRoute.value.name).toBe('operator')
    expect(getArenas).toHaveBeenCalledTimes(2)
  })

  it('drops a fight the server refused once it is no longer scheduled', async () => {
    vi.mocked(selectArenaMatch).mockRejectedValue(
      new ApiError(409, 'match_not_scheduled', ['match_not_scheduled']),
    )
    const { wrapper } = await mountAt('/operator')

    await choose(wrapper, '1 · Arena', 'Arena 01')
    await choose(wrapper, '2 · Luta', 'Marte × Cobalto')
    vi.mocked(getMatchSummaries).mockResolvedValue([
      match('m1', 'ongoing'),
      match('m5', 'scheduled'),
    ])
    await openButton(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.findAll('input[name="fight"]:checked')).toHaveLength(0)
    expect(openButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('drops a fight the server says is already open on another arena', async () => {
    vi.mocked(selectArenaMatch).mockRejectedValue(
      new ApiError(409, 'match_already_current', ['match_already_current']),
    )
    const { wrapper } = await mountAt('/operator')

    await choose(wrapper, '1 · Arena', 'Arena 01')
    await choose(wrapper, '2 · Luta', 'Marte × Cobalto')
    vi.mocked(getArenas).mockResolvedValue([
      ...arenas,
      { ...freeArena('a4', 'Arena 04'), currentMatchId: 'm1' },
    ])
    await openButton(wrapper).trigger('click')
    await flushPromises()

    expect(card(wrapper, '2 · Luta', 'Marte × Cobalto').text()).toContain('Aberta na Arena 04')
    expect(wrapper.findAll('input[name="fight"]:checked')).toHaveLength(0)
    expect(openButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it("links a busy arena to its open fight's run view", async () => {
    const { wrapper } = await mountAt('/operator')

    const link = group(wrapper, '1 · Arena')
      .findAll('a')
      .find((a) => a.text() === 'Ir para a luta')!
    expect(link.attributes('href')).toBe('/operator/m3')
  })

  it('points to the Arenas page when the account has no arena', async () => {
    vi.mocked(getArenas).mockResolvedValue([])
    const { wrapper } = await mountAt('/operator')

    expect(group(wrapper, '1 · Arena').text()).toContain('Nenhuma arena cadastrada.')
    expect(wrapper.find('a[href="/manage/arenas"]').exists()).toBe(true)
  })

  it('says when the championship has no scheduled fight', async () => {
    vi.mocked(getMatchSummaries).mockResolvedValue([match('m2', 'finished')])
    const { wrapper } = await mountAt('/operator')

    expect(group(wrapper, '2 · Luta').text()).toContain('Nenhuma luta programada neste campeonato.')
  })

  it('offers a retry when loading fails', async () => {
    vi.mocked(getArenas).mockRejectedValueOnce(new Error('network'))
    const { wrapper } = await mountAt('/operator')

    expect(wrapper.get('[role="alert"]').text()).toContain('Não foi possível carregar')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Tentar novamente')!
      .trigger('click')
    await flushPromises()

    expect(cards(wrapper, '1 · Arena')).toHaveLength(3)
  })
})
