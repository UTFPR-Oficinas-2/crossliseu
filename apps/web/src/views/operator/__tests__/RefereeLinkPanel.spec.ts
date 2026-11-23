import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import { getRefereeToken } from '@/data'
import { liveToken } from '@/stores/__tests__/token-helpers'
import { TOKEN_STORAGE_KEY } from '@/stores/auth'
import RefereeLinkPanel from '../components/RefereeLinkPanel.vue'

vi.mock('@/data', () => ({
  getRefereeToken: vi.fn<typeof getRefereeToken>(),
}))

const TOKEN = 'abcdefghijklmnopqrstuv'

async function mountPanel(props: { matchId?: string; closed?: boolean } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<p />' } },
      {
        path: '/referee/:accessToken',
        name: 'referee-session',
        component: { template: '<p />' },
      },
    ],
  })
  const wrapper = mount(RefereeLinkPanel, {
    props: { matchId: 'm1', closed: false, ...props },
    global: { plugins: [router] },
  })
  await flushPromises()
  return wrapper
}

describe('RefereeLinkPanel', () => {
  enableAutoUnmount(afterEach)
  const get = vi.mocked(getRefereeToken)
  let jwt: string

  beforeEach(() => {
    jwt = liveToken()
    localStorage.setItem(TOKEN_STORAGE_KEY, jwt)
    setActivePinia(createPinia())
    get.mockReset()
    get.mockResolvedValue({ token: TOKEN })
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('requests the referee token when opened', async () => {
    await mountPanel()

    expect(get).toHaveBeenCalledWith('m1', jwt)
  })

  it('shows the referee link with a copy button', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const wrapper = await mountPanel()
    const link = `${window.location.origin}/referee/${TOKEN}`

    expect(wrapper.text()).toContain(link)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Copiar link')!
      .trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(link)
    expect(wrapper.text()).toContain('Copiado.')
  })

  it('requests again for another match', async () => {
    const wrapper = await mountPanel()

    await wrapper.setProps({ matchId: 'm2' })
    await flushPromises()

    expect(get).toHaveBeenLastCalledWith('m2', jwt)
  })

  it('hides the referee link after the fight is closed', async () => {
    get.mockRejectedValue(new ApiError(409, 'match_closed', ['match_closed']))
    const wrapper = await mountPanel()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('/referee/')
  })

  it('does not request a token for a closed fight', async () => {
    const wrapper = await mountPanel({ closed: true })

    expect(get).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('/referee/')
  })

  it('hides the link once the fight closes', async () => {
    const wrapper = await mountPanel()

    await wrapper.setProps({ closed: true })

    expect(wrapper.text()).not.toContain('/referee/')
  })

  it('shows an error when the token cannot be loaded', async () => {
    get.mockRejectedValue(new ApiError(0, 'network'))
    const wrapper = await mountPanel()

    expect(wrapper.find('[role="alert"]').text()).toContain('link dos árbitros')
  })
})
