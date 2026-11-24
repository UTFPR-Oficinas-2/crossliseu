import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useRefereeStore } from '@/stores/referee'
import InvalidAccessView from '../InvalidAccessView.vue'

const stub = { render: () => null }

async function mountView(path = '/referee/invalid-access') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/referee/invalid-access', name: 'referee-invalid-access', component: InvalidAccessView },
      { path: '/referee/:accessToken', name: 'referee-session', component: stub },
    ],
  })
  await router.push(path)
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useRefereeStore()
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  return { wrapper, store, router }
}

describe('InvalidAccessView', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('says the link is no longer valid by default', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.text()).toContain('ACESSO EXPIRADO')
    expect(wrapper.text()).toContain('Este link não vale mais')
    expect(wrapper.text()).toContain('Peça ao operador o link certo para esta luta.')
  })

  it('says the fight already has three referees for a fourth name', async () => {
    const { wrapper, store } = await mountView()
    store.invalidReason = 'seats_full'
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Esta luta já tem 3 árbitros')
    expect(wrapper.text()).not.toContain('Este link não vale mais')
  })

  it('"Tentar novamente" goes back to the same link', async () => {
    const { wrapper, store, router } = await mountView()
    store.token = 'tok'

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('referee-session')
    expect(router.currentRoute.value.params.accessToken).toBe('tok')
  })

  it('"Tentar novamente" still finds the link after the page reloaded (empty store)', async () => {
    const { wrapper, router } = await mountView('/referee/invalid-access?t=tok')

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('referee-session')
    expect(router.currentRoute.value.params.accessToken).toBe('tok')
  })

  it('a freed seat is not described as a dead link only', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.text()).toContain('seu lugar foi liberado pelo operador')
  })

  it('"Tentar novamente" reloads the page when no link is known', async () => {
    const reload = vi.fn<() => void>()
    vi.stubGlobal('location', { ...window.location, reload })
    const { wrapper } = await mountView()

    await wrapper.get('button').trigger('click')

    expect(reload).toHaveBeenCalledOnce()
  })
})
