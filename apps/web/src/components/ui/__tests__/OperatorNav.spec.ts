import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OperatorNav from '../OperatorNav.vue'

const props = {
  arena: 'Arena 01',
  championship: 'Copa Crossliseu 2026',
  robotA: 'Marte',
  robotB: 'Cobalto',
  arenaConnected: true,
}

describe('OperatorNav', () => {
  it('shows the arena, championship and pairing as one context line', () => {
    const wrapper = mount(OperatorNav, { props })

    expect(wrapper.get('.operator-nav__context').text().replace(/\s+/g, ' ')).toBe(
      'Arena 01 · Copa Crossliseu 2026 · Marte × Cobalto',
    )
  })

  it('shows a connected arena in green', () => {
    const pill = mount(OperatorNav, { props }).get('.status-pill')

    expect(pill.text()).toBe('Arena conectada')
    expect(pill.classes()).toContain('status-pill--success')
  })

  it('shows a disconnected arena in red', () => {
    const pill = mount(OperatorNav, { props: { ...props, arenaConnected: false } }).get(
      '.status-pill',
    )

    expect(pill.text()).toBe('Arena não conectada')
    expect(pill.classes()).toContain('status-pill--danger')
  })

  it('emits exit from "Sair da operação"', async () => {
    const wrapper = mount(OperatorNav, { props })

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('exit')).toHaveLength(1)
  })
})
