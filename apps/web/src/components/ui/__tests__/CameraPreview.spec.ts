import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CameraPreview from '../CameraPreview.vue'

describe('CameraPreview', () => {
  it('shows the caption, the signal and the arena outline without a stream', () => {
    const wrapper = mount(CameraPreview, {
      props: { caption: 'Ao vivo', signal: '1280 × 720 · 30 fps' },
    })

    expect(wrapper.text()).toContain('Ao vivo')
    expect(wrapper.text()).toContain('1280 × 720 · 30 fps')
    expect(wrapper.find('img').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Gravando')
  })

  it('shows the orange GRAVANDO pill and the time while recording', () => {
    const wrapper = mount(CameraPreview, { props: { recording: true, elapsed: '01:18' } })

    expect(wrapper.find('.status-pill--accent').text()).toBe('Gravando')
    expect(wrapper.text()).toContain('01:18')
    expect(wrapper.find('.status-pill--danger').exists()).toBe(false)
  })
})
