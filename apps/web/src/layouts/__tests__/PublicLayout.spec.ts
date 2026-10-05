import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import { liveToken } from '@/stores/__tests__/token-helpers'
import { TOKEN_STORAGE_KEY, useAuthStore } from '@/stores/auth'
import PublicLayout from '../PublicLayout.vue'

const stub = { render: () => null }

async function mountLayout(startAt = '/') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        component: PublicLayout,
        children: [
          { path: '', name: 'home', component: stub },
          { path: 'sign-in', name: 'sign-in', component: stub },
          { path: 'other', name: 'other', component: stub },
        ],
      },
    ],
  })
  await router.push(startAt)
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  return { wrapper, router }
}

describe('PublicLayout', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the public nav with "Entrar" when signed out', async () => {
    const { wrapper } = await mountLayout()

    expect(wrapper.text()).toContain('Entrar')
    expect(wrapper.text()).not.toContain('Sair')
  })

  it('shows the app nav with the username when signed in', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, liveToken('maria'))

    const { wrapper } = await mountLayout()

    expect(wrapper.text()).toContain('maria')
    expect(wrapper.text()).toContain('Sair')
    expect(wrapper.text()).not.toContain('Entrar')
  })

  it('signs out and goes home when "Sair" is clicked', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, liveToken())
    const { wrapper, router } = await mountLayout('/other')
    const auth = useAuthStore()

    const signOut = wrapper.findAll('button').find((button) => button.text() === 'Sair')
    await signOut?.trigger('click')
    await flushPromises()

    expect(auth.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.name).toBe('home')
    expect(wrapper.text()).toContain('Entrar')
  })
})
