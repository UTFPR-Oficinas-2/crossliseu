import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

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
    expect(buttons(wrapper)).toEqual(['Editar resultado', 'Confirmar resultado', 'Declarar empate'])
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
    expect(buttons(wrapper)).toEqual(['Editar resultado', 'Confirmar empate'])
  })

  it('emits confirm and draw from its buttons', async () => {
    const wrapper = render({})
    const [, confirm, draw] = wrapper.findAll('button')

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

  describe('editing the end reason before close (#57)', () => {
    const button = (wrapper: ReturnType<typeof render>, label: string) =>
      wrapper.findAll('button').find((b) => b.text() === label)!
    const radios = (wrapper: ReturnType<typeof render>) =>
      wrapper.findAll<HTMLInputElement>('input[type="radio"]')
    async function openEditor(state: Partial<OperatorFightState> = {}, disabled = false) {
      const wrapper = render({ endReason: 'manual', ...state }, disabled)
      await button(wrapper, 'Editar resultado').trigger('click')
      return wrapper
    }

    it('lists the four end reasons with the current one checked and marked', async () => {
      const wrapper = await openEditor()

      expect(wrapper.text()).toContain('Ajuste o motivo do encerramento')
      expect(radios(wrapper).map((r) => r.element.value)).toEqual([
        'time_out',
        'manual',
        'surrender:A',
        'surrender:B',
      ])
      expect(radios(wrapper).map((r) => r.element.checked)).toEqual([false, true, false, false])
      const titles = wrapper.findAll('.choice-item__title').map((t) => t.text())
      expect(titles).toEqual([
        'Tempo esgotado',
        'Encerrada pelo operador',
        'Desistência do lado A · Tritura',
        'Desistência do lado B · Ferrugem',
      ])
      const metas = wrapper.findAll('.choice-item__meta').map((t) => t.text())
      expect(metas).toEqual([
        'O cronômetro chegou a zero',
        'Motivo atual',
        'Tritura desistiu',
        'Ferrugem desistiu',
      ])
    })

    it('checks the side that gave up when a surrender ended the fight', async () => {
      const wrapper = await openEditor({ endReason: 'surrender', surrenderedSide: 'B' })

      expect(radios(wrapper).map((r) => r.element.checked)).toEqual([false, false, false, true])
    })

    it('holds Close and the draw call while editing, and saves only a change', async () => {
      const wrapper = await openEditor()

      expect(buttons(wrapper)).toEqual([
        'Confirmar resultado',
        'Declarar empate',
        'Salvar resultado',
        'Cancelar',
      ])
      expect(button(wrapper, 'Confirmar resultado').attributes('disabled')).toBeDefined()
      expect(button(wrapper, 'Declarar empate').attributes('disabled')).toBeDefined()
      expect(button(wrapper, 'Salvar resultado').attributes('disabled')).toBeDefined()
    })

    it('saves a surrender with the side that gave up and closes once the server has it', async () => {
      const wrapper = await openEditor()

      await radios(wrapper)[3]!.setValue(true)
      await button(wrapper, 'Salvar resultado').trigger('click')

      expect(wrapper.emitted('correct')).toEqual([[{ endReason: 'surrender', side: 'B' }]])
      // Still open until the corrected state arrives, so a failed save keeps the choice
      expect(radios(wrapper).map((r) => r.element.checked)).toEqual([false, false, false, true])

      await wrapper.setProps({
        state: {
          ...finished,
          endReason: 'surrender',
          surrenderedSide: 'B',
          proposal: { outcome: 'A', basis: 'surrender' },
        },
      })
      expect(radios(wrapper)).toHaveLength(0)
    })

    it('moves focus into the editor on open and back to Editar resultado on close', async () => {
      const wrapper = mount(ResultConfirmation, {
        props: { state: { ...finished, endReason: 'manual' }, disabled: false },
        attachTo: document.body,
      })

      await button(wrapper, 'Editar resultado').trigger('click')
      await nextTick()
      expect(document.activeElement).toBe(radios(wrapper)[1]!.element)

      await button(wrapper, 'Cancelar').trigger('click')
      await nextTick()
      expect(document.activeElement).toBe(button(wrapper, 'Editar resultado').element)
      wrapper.unmount()
    })

    it('saves another reason without a side', async () => {
      const wrapper = await openEditor({ endReason: 'surrender', surrenderedSide: 'A' })

      await radios(wrapper)[1]!.setValue(true)
      await button(wrapper, 'Salvar resultado').trigger('click')

      expect(wrapper.emitted('correct')).toEqual([[{ endReason: 'manual' }]])
    })

    it('cancels without saving', async () => {
      const wrapper = await openEditor()

      await radios(wrapper)[0]!.setValue(true)
      await button(wrapper, 'Cancelar').trigger('click')

      expect(wrapper.emitted('correct')).toBeUndefined()
      expect(radios(wrapper)).toHaveLength(0)
      expect(buttons(wrapper)[0]).toBe('Editar resultado')
    })

    it('cannot edit or save while a command runs', async () => {
      const idle = render({ endReason: 'manual' }, true)
      expect(button(idle, 'Editar resultado').attributes('disabled')).toBeDefined()

      const wrapper = await openEditor()
      await radios(wrapper)[0]!.setValue(true)
      await wrapper.setProps({ disabled: true })
      expect(button(wrapper, 'Salvar resultado').attributes('disabled')).toBeDefined()
      // A save in flight lands anyway, so the editor stays until the server reports it
      expect(button(wrapper, 'Cancelar').attributes('disabled')).toBeDefined()
    })

    it('drops the editor once the fight is closed', async () => {
      const wrapper = await openEditor()

      await wrapper.setProps({
        state: { ...finished, endReason: 'manual', closed: true, proposal: null, winnerSide: 'A' },
      })

      expect(radios(wrapper)).toHaveLength(0)
      expect(buttons(wrapper)).toEqual([])
    })
  })
})
