import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FightRow from '../FightRow.vue'

type Props = InstanceType<typeof FightRow>['$props']

const mountRow = (props: Partial<Props> & Pick<Props, 'state'>) =>
  mount(FightRow, {
    props: { fightNumber: 8, robotA: 'MARTE', robotB: 'COBALTO', ...props } as Props,
  })

const competitors = (wrapper: ReturnType<typeof mountRow>) =>
  wrapper.get('.fight-row__competitors').text().replace(/\s+/g, ' ')

describe('FightRow', () => {
  it('shows the match state pill', () => {
    const pill = mountRow({ state: 'scheduled' }).get('.status-pill')

    expect(pill.text()).toBe('Programada')
    expect(pill.classes()).toContain('status-pill--info')
  })

  it('names the winner first: "A venceu B"', () => {
    const wrapper = mountRow({ state: 'finished', winner: 'A' })

    expect(competitors(wrapper)).toBe('MARTE venceu COBALTO')
    expect(wrapper.text()).not.toContain('Empate')
  })

  it('puts the winner first when it is Lado B', () => {
    expect(competitors(mountRow({ state: 'finished', winner: 'B' }))).toBe('COBALTO venceu MARTE')
  })

  it('marks a draw with "Empate"', () => {
    const wrapper = mountRow({ state: 'finished', winner: null })

    expect(competitors(wrapper)).toBe('MARTE × COBALTO')
    expect(wrapper.text()).toContain('Empate')
  })
})
