import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'

import AppNav from '../AppNav.vue'

const stub = { render: () => null }

function mountNav(extraRoutes: RouteRecordRaw[] = []) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'home', component: stub }, ...extraRoutes],
  })
  return mount(AppNav, { props: { userName: 'admin' }, global: { plugins: [router] } })
}

describe('AppNav', () => {
  it('hides items that point to an unregistered route', () => {
    const wrapper = mountNav()

    expect(wrapper.text()).toContain('Campeonatos')
    expect(wrapper.text()).not.toContain('Meus campeonatos')
  })

  it('shows items whose route exists', () => {
    const wrapper = mountNav([{ path: '/manage', name: 'my-championships', component: stub }])

    expect(wrapper.text()).toContain('Meus campeonatos')
  })

  it('emits signOut when "Sair" is clicked', async () => {
    const wrapper = mountNav()

    expect(wrapper.text()).toContain('Sair')
    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('signOut')).toHaveLength(1)
  })
})
