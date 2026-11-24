import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import { useRefereeStore, type RefereeFight } from '@/stores/referee'
import RefereeScoring from '../components/RefereeScoring.vue'

function setup(fight: Partial<RefereeFight> = {}, own = { A: 0, B: 0 }) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useRefereeStore()
  store.phase = 'active'
  store.ownCounts = own
  store.remainingMs = 102_000
  store.fight = {
    status: 'ongoing',
    endReason: null,
    robots: { A: { name: 'Marte' }, B: { name: 'Cobalto' } },
    score: { A: 6, B: 2 },
    ...fight,
  }
  const score = vi.spyOn(store, 'score').mockResolvedValue()
  const wrapper = mount(RefereeScoring, { global: { plugins: [pinia] } })
  return { wrapper, store, score }
}

const card = (wrapper: ReturnType<typeof setup>['wrapper'], side: 'a' | 'b') =>
  wrapper.get(`.score-card--${side}`)
const plus = (wrapper: ReturnType<typeof setup>['wrapper'], side: 'a' | 'b') =>
  card(wrapper, side).get('button.score-card__plus')
const minus = (wrapper: ReturnType<typeof setup>['wrapper'], side: 'a' | 'b') =>
  card(wrapper, side).get('button.score-card__minus')

describe('RefereeScoring', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the remaining time and the running pill', () => {
    const { wrapper } = setup()

    expect(wrapper.text()).toContain('TEMPO RESTANTE')
    expect(wrapper.text()).toContain('01:42')
    expect(wrapper.text()).toContain('EM ANDAMENTO')
  })

  it('rounds the remaining time up', async () => {
    const { wrapper, store } = setup()
    store.remainingMs = 101_001
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('01:42')
  })

  it('shows the totals of the three referees, not the own counts', () => {
    const { wrapper } = setup({}, { A: 1, B: 0 })

    expect(card(wrapper, 'a').text()).toContain('LADO A')
    expect(card(wrapper, 'a').text()).toContain('Marte')
    expect(card(wrapper, 'a').get('.score-card__total').text()).toBe('6')
    expect(card(wrapper, 'b').get('.score-card__total').text()).toBe('2')
    expect(card(wrapper, 'a').text()).toContain('TOTAL')
  })

  it('+1 and −1 call the store with the side and the action', async () => {
    const { wrapper, score } = setup({}, { A: 0, B: 1 })

    await plus(wrapper, 'a').trigger('click')
    await minus(wrapper, 'b').trigger('click')

    expect(score).toHaveBeenNthCalledWith(1, 'A', 1)
    expect(score).toHaveBeenNthCalledWith(2, 'B', -1)
  })

  it('−1 is disabled at the referee’s own 0 and enabled at 1', () => {
    const { wrapper } = setup({}, { A: 0, B: 1 })

    expect(minus(wrapper, 'a').attributes('disabled')).toBeDefined()
    expect(minus(wrapper, 'b').attributes('disabled')).toBeUndefined()
    expect(plus(wrapper, 'a').attributes('disabled')).toBeUndefined()
  })

  it('paused disables every button and says why', () => {
    const { wrapper } = setup({ status: 'paused' }, { A: 1, B: 1 })

    expect(wrapper.text()).toContain('PAUSADA')
    expect(wrapper.text()).toContain('Luta pausada. A pontuação volta quando o operador retomar.')
    expect(wrapper.findAll('button[disabled]')).toHaveLength(4)
  })

  it('reconnecting shows SEM CONEXÃO, says nothing is sent and disables every button', async () => {
    const { wrapper, store } = setup({}, { A: 1, B: 1 })
    store.connection = 'reconnecting'
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('SEM CONEXÃO')
    expect(wrapper.text()).toContain(
      'Reconectando… seus pontos não são enviados até a conexão voltar.',
    )
    expect(wrapper.findAll('button[disabled]')).toHaveLength(4)
  })

  it('shows the feedback line of the last press', async () => {
    const { wrapper, store } = setup()
    store.feedback = { tone: 'success', text: 'Ponto registrado às 00:58 · Marte' }
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[role="status"]').text()).toContain('Ponto registrado às 00:58 · Marte')
  })

  it('explains the totals under the cards', () => {
    const { wrapper } = setup()

    expect(wrapper.text()).toContain(
      'Placar total dos 3 árbitros. Cada toque soma ou tira 1 ponto do lado escolhido.',
    )
  })
})
