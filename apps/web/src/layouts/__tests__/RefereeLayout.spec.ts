import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useRefereeStore } from '@/stores/referee'
import RefereeLayout from '../RefereeLayout.vue'

const stub = { render: () => null }

async function mountLayout(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/referee',
        component: RefereeLayout,
        children: [
          { path: 'invalid-access', name: 'referee-invalid-access', component: stub },
          { path: ':accessToken', name: 'referee-session', component: stub },
        ],
      },
    ],
  })
  await router.push(path)
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useRefereeStore()
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  return { wrapper, store }
}

const tag = (wrapper: Awaited<ReturnType<typeof mountLayout>>['wrapper']) =>
  wrapper.find('.referee-layout__role')

describe('RefereeLayout', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the seat once joined', async () => {
    const { wrapper, store } = await mountLayout('/referee/tok')
    store.seat = 2
    store.phase = 'active'
    await wrapper.vm.$nextTick()

    expect(tag(wrapper).text()).toBe('ÁRBITRO 2 DE 3')
  })

  it('shows no tag on the name form', async () => {
    const { wrapper, store } = await mountLayout('/referee/tok')
    store.phase = 'name'
    await wrapper.vm.$nextTick()

    expect(tag(wrapper).exists()).toBe(false)
  })

  it('shows ACESSO NEGADO on the invalid-access route', async () => {
    const { wrapper } = await mountLayout('/referee/invalid-access')

    expect(tag(wrapper).text()).toBe('ACESSO NEGADO')
  })

  it('shows ACESSO NEGADO instead of the seat once invalid', async () => {
    const { wrapper, store } = await mountLayout('/referee/tok')
    store.seat = 1
    store.phase = 'invalid'
    await wrapper.vm.$nextTick()

    expect(tag(wrapper).text()).toBe('ACESSO NEGADO')
  })
})
