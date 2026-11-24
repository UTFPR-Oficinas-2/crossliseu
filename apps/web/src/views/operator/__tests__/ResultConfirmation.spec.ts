import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import type { OperatorFightState } from '@/data'
import ResultConfirmation from '../components/ResultConfirmation.vue'

const finished: OperatorFightState = {
  matchId: 'm1',
  status: 'finished',
  remainingMs: 0,
  endReason: 'time_out',
  robots: { A: { name: 'Tritura' }, B: { name: 'Ferrugem' } },
  score: { A: 4, B: 2 },
  closed: false,
  hasSelectedArena: true,
  winnerSide: null,
  draw: false,
  proposal: { outcome: 'A', basis: 'points' },
  surrenderedSide: null,
}

function render(state: Partial<OperatorFightState>, disabled = false) {
  return mount(ResultConfirmation, { props: { state: { ...finished, ...state }, disabled } })
}
const buttons = (wrapper: ReturnType<typeof render>) =>
  wrapper.findAll('button').map((button) => button.text())

describe('ResultConfirmation', () => {
  it('proposes the winner by points with both actions', () => {
    const wrapper = render({})

    expect(wrapper.text()).toContain('Vencedor proposto: Tritura')
    expect(wrapper.text()).toContain('por pontos 4 × 2')
    expect(buttons(wrapper)).toEqual(['Confirmar resultado', 'Declarar empate'])
  })

  it('proposes the other side after a surrender', () => {
    const wrapper = render({
      endReason: 'surrender',
      proposal: { outcome: 'B', basis: 'surrender' },
    })

    expect(wrapper.text()).toContain('Vencedor proposto: Ferrugem')
    expect(wrapper.text()).toContain('por desistência do lado A')
  })

  it('proposes a draw on equal points, with only the confirm action', () => {
    const wrapper = render({ score: { A: 2, B: 2 }, proposal: { outcome: 'draw', basis: 'tied' } })

    expect(wrapper.text()).toContain('Empate proposto (placar igual 2 × 2)')
    expect(buttons(wrapper)).toEqual(['Confirmar empate'])
  })

  it('emits confirm and draw from its buttons', async () => {
    const wrapper = render({})
    const [confirm, draw] = wrapper.findAll('button')

    await confirm!.trigger('click')
    await draw!.trigger('click')

    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('draw')).toHaveLength(1)
  })

  it('disables both actions while a command runs', () => {
    const wrapper = render({}, true)

    for (const button of wrapper.findAll('button')) {
      expect(button.attributes('disabled')).toBeDefined()
    }
  })

  it('says so when a closed fight has no recorded result', () => {
    const wrapper = render({ closed: true, proposal: null })

    expect(wrapper.text()).toContain('Resultado não registrado')
  })

  it('shows the confirmed winner or draw once closed, without actions', () => {
    const winner = render({ closed: true, proposal: null, winnerSide: 'B' })
    expect(winner.text()).toContain('Vencedor: Ferrugem')
    expect(buttons(winner)).toEqual([])

    const draw = render({ closed: true, proposal: null, draw: true })
    expect(draw.text()).toContain('Empate')
    expect(buttons(draw)).toEqual([])
  })
})
