import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import type { MatchEndReason } from '@/types'
import RefereeFinished from '../components/RefereeFinished.vue'

function render(
  endReason: MatchEndReason | null,
  winnerSide: 'A' | 'B' | null | undefined = undefined,
) {
  return mount(RefereeFinished, {
    props: {
      robots: { A: 'Marte', B: 'Cobalto' },
      score: { A: 8, B: 2 },
      endReason,
      winnerSide,
    },
  })
}

const reason = (wrapper: ReturnType<typeof render>) => wrapper.find('.finished__reason')

describe('RefereeFinished', () => {
  it('shows both robots with their final totals', () => {
    const wrapper = render('time_out')

    expect(wrapper.text()).toContain('LUTA ENCERRADA')
    expect(wrapper.text()).toContain('Marte × Cobalto')
    expect(wrapper.get('.finished__row--a').text()).toContain('Marte')
    expect(wrapper.get('.finished__row--a .finished__value').text()).toBe('8')
    expect(wrapper.get('.finished__row--b .finished__value').text()).toBe('2')
    expect(wrapper.text()).toContain('quando a luta for fechada, este link deixa de funcionar')
  })

  it.each([
    ['time_out', 'A', 'TEMPO ESGOTADO'],
    ['manual', 'B', 'ENCERRADA PELO OPERADOR'],
    ['surrender', 'A', 'DESISTÊNCIA DO LADO B'],
    ['surrender', 'B', 'DESISTÊNCIA DO LADO A'],
    ['surrender', undefined, 'DESISTÊNCIA'],
  ] as const)('%s with winner %s reads %s', (endReason, winnerSide, label) => {
    expect(reason(render(endReason, winnerSide)).text()).toBe(label)
  })

  // The API sets a winner only on a surrender; others get theirs when the result is confirmed
  it.each([
    ['time_out', 'TEMPO ESGOTADO'],
    ['manual', 'ENCERRADA PELO OPERADOR'],
  ] as const)('%s without a winner still reads %s, never EMPATE', (endReason, label) => {
    expect(reason(render(endReason, null)).text()).toBe(label)
  })

  it('hides the reason when there is none', () => {
    expect(reason(render(null, undefined)).exists()).toBe(false)
  })
})
