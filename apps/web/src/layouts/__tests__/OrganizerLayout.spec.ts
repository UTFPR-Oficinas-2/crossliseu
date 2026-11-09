import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import OrganizerLayout from '../OrganizerLayout.vue'

vi.mock('@/data', () => ({
  getChampionship: vi.fn<() => Promise<null>>().mockResolvedValue(null),
}))

const stub = { render: () => null }

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: stub },
      { path: '/championships/:championshipId', name: 'championship', component: stub },
      {
        path: '/manage',
        component: OrganizerLayout,
        children: [
          { path: '', name: 'my-championships', component: stub },
          {
            path: ':championshipId/participants',
            name: 'championship-participants',
            component: stub,
          },
          {
            path: ':championshipId/participants/new',
            name: 'participant-create',
            component: stub,
            meta: { sidebar: 'championship-participants' },
          },
          { path: ':championshipId/matches', name: 'championship-matches', component: stub },
          {
            path: ':championshipId/matches/:matchId/edit',
            name: 'match-edit',
            component: stub,
            meta: { sidebar: 'championship-matches' },
          },
          { path: ':championshipId/settings', name: 'championship-settings', component: stub },
        ],
      },
      {
        path: '/arenas',
        component: OrganizerLayout,
        children: [{ path: '', name: 'arenas', component: stub }],
      },
    ],
  })
  await router.push(path)
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

const currentItems = async (path: string) =>
  (await mountAt(path))
    .findAll('nav[aria-label="Gerenciar campeonato"] a[aria-current="page"]')
    .map((a) => a.text())

describe('OrganizerLayout sidebar', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('highlights the list a form page belongs to', async () => {
    expect(await currentItems('/manage/c1/participants/new')).toEqual(['Participantes'])
    expect(await currentItems('/manage/c1/matches/m1/edit')).toEqual(['Lutas'])
  })

  it('lists Participantes, Lutas and Configurações, without a note', async () => {
    const wrapper = await mountAt('/manage/c1/participants')

    expect(
      wrapper.findAll('nav[aria-label="Gerenciar campeonato"] a').map((a) => a.text()),
    ).toEqual(['Participantes', 'Lutas', 'Configurações'])
    expect(wrapper.text()).not.toContain('Somente organizadores autorizados')
  })

  it('highlights a route without meta by its own name', async () => {
    expect(await currentItems('/manage/c1/matches')).toEqual(['Lutas'])
  })
})

const currentTopItems = async (path: string) =>
  (await mountAt(path))
    .findAll('nav[aria-label="Navegação principal"] a[aria-current="page"]')
    .map((a) => a.text())

describe('OrganizerLayout top bar', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('highlights Arenas on the arenas page', async () => {
    expect(await currentTopItems('/arenas')).toEqual(['Arenas'])
  })

  it('highlights Meus campeonatos on championship management', async () => {
    expect(await currentTopItems('/manage')).toEqual(['Meus campeonatos'])
    expect(await currentTopItems('/manage/c1/participants')).toEqual(['Meus campeonatos'])
  })
})
