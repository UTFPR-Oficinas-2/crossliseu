import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import StatusPill from '../StatusPill.vue'
import type { StatusTone } from '../status-pill'

const tones: StatusTone[] = ['neutral', 'accent', 'info', 'success', 'warning', 'danger']

describe('StatusPill', () => {
  it.each(tones)('renders the %s tone with its label', (tone) => {
    const wrapper = mount(StatusPill, { props: { label: 'Em andamento', tone } })

    expect(wrapper.classes()).toContain(`status-pill--${tone}`)
    expect(wrapper.text()).toBe('Em andamento')
  })

  it('has no tone outside the six Figma tones', () => {
    // @ts-expect-error `live` is not a Figma tone
    const tone: StatusTone = 'live'
    expect(tones).not.toContain(tone)
  })
})
