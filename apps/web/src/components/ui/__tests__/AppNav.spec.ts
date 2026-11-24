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

  it('lists Campeonatos, Meus campeonatos, and Arenas in order', () => {
    const wrapper = mountNav([
      { path: '/manage', name: 'my-championships', component: stub },
      { path: '/arenas', name: 'arenas', component: stub },
    ])

    expect(wrapper.findAll('nav a').map((a) => a.text())).toEqual([
      'Campeonatos',
      'Meus campeonatos',
      'Arenas',
    ])
  })

  it('links Arenas to /arenas', () => {
    const wrapper = mountNav([{ path: '/arenas', name: 'arenas', component: stub }])

    const link = wrapper.findAll('a').find((a) => a.text() === 'Arenas')
    expect(link?.attributes('href')).toBe('/arenas')
  })

  it('emits signOut when "Sair" is clicked', async () => {
    const wrapper = mountNav()

    expect(wrapper.text()).toContain('Sair')
    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('signOut')).toHaveLength(1)
  })
})
