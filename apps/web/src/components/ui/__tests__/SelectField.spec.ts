import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import SelectField from '../SelectField.vue'
import { firstEnabled, stepEnabled, type SelectOption } from '../select-field'

const options: SelectOption[] = [
  { value: 'tita', label: 'Titã', meta: 'Equipe Volt · Peso leve' },
  {
    value: 'marte',
    label: 'Marte',
    meta: 'Equipe Órbita · Peso leve',
    disabled: true,
    disabledReason: 'Já escolhido como Robô 1',
  },
  { value: 'aco', label: 'Aço', meta: 'Equipe Aço · Peso leve' },
]

const mounted: { unmount: () => void }[] = []
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
})

function mountSelect(
  props: Partial<{
    modelValue: string
    placeholder: string
    hint: string
    error: string
    disabled: boolean
  }> = {},
) {
  const wrapper = mount(SelectField, {
    props: { label: 'Robô 2 *', options, groupLabel: 'Participantes · Peso leve', ...props },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  return wrapper
}

type Wrapper = ReturnType<typeof mountSelect>

const combobox = (wrapper: Wrapper) => wrapper.get('[role="combobox"]')
const optionEls = (wrapper: Wrapper) => wrapper.findAll('[role="option"]')
const activeId = (wrapper: Wrapper) => combobox(wrapper).attributes('aria-activedescendant')
const emitted = (wrapper: Wrapper) =>
  (wrapper.emitted('update:modelValue') ?? []).map(([value]) => value)

describe('select-field helpers', () => {
  it('steps over disabled options without wrapping', () => {
    expect(stepEnabled(options, 0, 1)).toBe(2)
    expect(stepEnabled(options, 2, -1)).toBe(0)
    expect(stepEnabled(options, 2, 1)).toBe(2)
    expect(firstEnabled(options)).toBe(0)
    expect(firstEnabled(options, true)).toBe(2)
    expect(firstEnabled([{ value: 'x', label: 'X', disabled: true }])).toBe(-1)
  })
})

describe('SelectField', () => {
  it('starts closed and shows the label and the placeholder', () => {
    const wrapper = mountSelect({ placeholder: 'Escolha um robô' })

    expect(wrapper.text()).toContain('Robô 2 *')
    expect(combobox(wrapper).text()).toContain('Escolha um robô')
    expect(combobox(wrapper).attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('[role="listbox"]').isVisible()).toBe(false)
  })

  it('opens on click with the group label, the metas and the disabled reason', async () => {
    const wrapper = mountSelect()

    await combobox(wrapper).trigger('click')

    expect(combobox(wrapper).attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('[role="listbox"]').isVisible()).toBe(true)
    expect(wrapper.text()).toContain('Participantes · Peso leve')
    const [tita, marte] = optionEls(wrapper)
    expect(tita!.text()).toContain('Equipe Volt · Peso leve')
    expect(marte!.attributes('aria-disabled')).toBe('true')
    expect(marte!.text()).toContain('Já escolhido como Robô 1')
    expect(marte!.text()).not.toContain('Equipe Órbita')
  })

  it('moves with the arrows, skipping disabled options, and picks with Enter', async () => {
    const wrapper = mountSelect()

    await combobox(wrapper).trigger('keydown', { key: 'ArrowDown' })
    expect(combobox(wrapper).attributes('aria-expanded')).toBe('true')
    expect(activeId(wrapper)).toBe(optionEls(wrapper)[0]!.attributes('id'))

    await combobox(wrapper).trigger('keydown', { key: 'ArrowDown' })
    expect(activeId(wrapper)).toBe(optionEls(wrapper)[2]!.attributes('id'))

    await combobox(wrapper).trigger('keydown', { key: 'Enter' })
    expect(emitted(wrapper)).toEqual(['aco'])
    expect(combobox(wrapper).attributes('aria-expanded')).toBe('false')
  })

  it('supports Space, Home and End', async () => {
    const wrapper = mountSelect()

    await combobox(wrapper).trigger('keydown', { key: ' ' })
    await combobox(wrapper).trigger('keydown', { key: 'End' })
    expect(activeId(wrapper)).toBe(optionEls(wrapper)[2]!.attributes('id'))
    await combobox(wrapper).trigger('keydown', { key: 'Home' })
    expect(activeId(wrapper)).toBe(optionEls(wrapper)[0]!.attributes('id'))
    await combobox(wrapper).trigger('keydown', { key: ' ' })

    expect(emitted(wrapper)).toEqual(['tita'])
  })

  it('closes with Escape without changing the value', async () => {
    const wrapper = mountSelect({ modelValue: 'tita' })

    await combobox(wrapper).trigger('click')
    await combobox(wrapper).trigger('keydown', { key: 'ArrowDown' })
    await combobox(wrapper).trigger('keydown', { key: 'Escape' })

    expect(combobox(wrapper).attributes('aria-expanded')).toBe('false')
    expect(emitted(wrapper)).toEqual([])
  })

  it('shows and marks the selected option, and opens on it', async () => {
    const wrapper = mountSelect({ modelValue: 'aco' })

    expect(combobox(wrapper).text()).toContain('Aço')
    await combobox(wrapper).trigger('click')

    expect(activeId(wrapper)).toBe(optionEls(wrapper)[2]!.attributes('id'))
    expect(optionEls(wrapper).map((o) => o.attributes('aria-selected'))).toEqual([
      'false',
      'false',
      'true',
    ])
  })

  it('picks an option by click and ignores disabled ones', async () => {
    const wrapper = mountSelect()

    await combobox(wrapper).trigger('click')
    await optionEls(wrapper)[1]!.trigger('click')
    expect(emitted(wrapper)).toEqual([])
    expect(combobox(wrapper).attributes('aria-expanded')).toBe('true')

    await optionEls(wrapper)[0]!.trigger('click')
    expect(emitted(wrapper)).toEqual(['tita'])
    expect(combobox(wrapper).attributes('aria-expanded')).toBe('false')
  })

  it('closes when the user presses outside', async () => {
    const wrapper = mountSelect()

    await combobox(wrapper).trigger('click')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(combobox(wrapper).attributes('aria-expanded')).toBe('false')
  })

  it('keeps the menu open and the focus on the trigger when pressing inside the menu', async () => {
    const wrapper = mountSelect()
    const trigger = wrapper.get<HTMLElement>('[role="combobox"]')

    await trigger.trigger('click')
    trigger.element.focus()

    for (const selector of ['.select-field__group', '.select-field__menu']) {
      const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
      wrapper.get(selector).element.dispatchEvent(press)
      await wrapper.vm.$nextTick()

      // Cancelling mousedown is what stops the browser from moving focus to body
      expect(press.defaultPrevented).toBe(true)
      expect(trigger.attributes('aria-expanded')).toBe('true')
      expect(document.activeElement).toBe(trigger.element)
    }
  })

  it('shows the error instead of the hint and marks the field invalid', () => {
    const wrapper = mountSelect({
      hint: 'Equipe Bigorna · Peso pesado',
      error: 'Escolha o robô 2.',
    })
    const describedBy = combobox(wrapper).attributes('aria-describedby')!

    expect(combobox(wrapper).attributes('aria-invalid')).toBe('true')
    expect(wrapper.get(`[id="${describedBy}"]`).text()).toBe('Escolha o robô 2.')
    expect(wrapper.text()).not.toContain('Equipe Bigorna · Peso pesado')
  })

  it('does not open while disabled', async () => {
    const wrapper = mountSelect({ disabled: true })

    expect(combobox(wrapper).attributes('tabindex')).toBe('-1')
    expect(combobox(wrapper).attributes('aria-disabled')).toBe('true')
    await combobox(wrapper).trigger('click')
    await combobox(wrapper).trigger('keydown', { key: 'ArrowDown' })

    expect(combobox(wrapper).attributes('aria-expanded')).toBe('false')
  })

  it('names the combobox after the field and the listbox after the field and group', () => {
    const wrapper = mountSelect()
    const ids = wrapper.get('[role="listbox"]').attributes('aria-labelledby')!.split(' ')

    expect(ids.map((id) => wrapper.get(`[id="${id}"]`).text())).toEqual([
      'Robô 2 *',
      'Participantes · Peso leve',
    ])
    expect(combobox(wrapper).attributes('aria-labelledby')).toBe(ids[0])
  })
})

describe('SelectField scrolling', () => {
  // jsdom has no scrollIntoView, so the component calls it optionally; stub it to observe the calls
  const scrollIntoView = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>()
  const scrolledTo = () => scrollIntoView.mock.contexts.at(-1)

  beforeEach(() => {
    scrollIntoView.mockClear()
    Element.prototype.scrollIntoView = scrollIntoView
  })
  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  it('scrolls the newly active option into view on ArrowDown', async () => {
    const wrapper = mountSelect()

    await combobox(wrapper).trigger('keydown', { key: 'ArrowDown' })
    await flushPromises()
    expect(scrolledTo()).toBe(optionEls(wrapper)[0]!.element)

    await combobox(wrapper).trigger('keydown', { key: 'ArrowDown' })
    await flushPromises()
    expect(scrolledTo()).toBe(optionEls(wrapper)[2]!.element)
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' })
  })

  it('scrolls the selected option into view when it opens', async () => {
    const wrapper = mountSelect({ modelValue: 'aco' })

    await combobox(wrapper).trigger('click')
    await flushPromises()

    expect(scrolledTo()).toBe(optionEls(wrapper)[2]!.element)
  })
})
