import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChoiceItem from '../ChoiceItem.vue'

const props = {
  modelValue: null as string | null,
  value: 'a1',
  name: 'arena',
  title: 'Arena 01',
  meta: 'Livre · caixa da arena conectada',
}

describe('ChoiceItem', () => {
  it('is a labelled radio with its title and meta', () => {
    const wrapper = mount(ChoiceItem, { props })
    const radio = wrapper.get('input[type="radio"]')

    expect(radio.attributes('name')).toBe('arena')
    expect(radio.attributes('value')).toBe('a1')
    expect(wrapper.get('label').text()).toContain('Arena 01')
    expect(wrapper.get('label').text()).toContain('Livre · caixa da arena conectada')
  })

  it('emits its value when chosen', async () => {
    const wrapper = mount(ChoiceItem, { props })

    await wrapper.get('input').setValue(true)

    expect(wrapper.emitted('update:modelValue')).toEqual([['a1']])
  })

  it('is checked and styled as selected when the model holds its value', () => {
    const wrapper = mount(ChoiceItem, { props: { ...props, modelValue: 'a1' } })

    expect((wrapper.get('input').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.get('label').classes()).toContain('choice-item--selected')
  })

  it('stays visible but cannot be chosen when disabled', async () => {
    const wrapper = mount(ChoiceItem, { props: { ...props, disabled: true } })

    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    expect(wrapper.get('label').classes()).toContain('choice-item--disabled')
  })

  it('renders the status slot', () => {
    const wrapper = mount(ChoiceItem, {
      props,
      slots: { status: '<span class="pill">Conectado</span>' },
    })

    expect(wrapper.get('.pill').text()).toBe('Conectado')
  })
})
