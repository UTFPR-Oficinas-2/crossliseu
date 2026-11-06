import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import InputField from '../InputField.vue'

describe('InputField', () => {
  it('renders a datetime-local input and binds its value', async () => {
    const wrapper = mount(InputField, {
      props: { label: 'Data e horário', type: 'datetime-local', modelValue: '' },
    })
    const input = wrapper.get('input[type="datetime-local"]')

    await input.setValue('2026-12-09T14:30')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['2026-12-09T14:30'])
  })
})
