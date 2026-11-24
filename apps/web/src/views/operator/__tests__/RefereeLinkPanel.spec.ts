import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import { freeRefereeSeat, getRefereeSeats, getRefereeToken, type OperatorFightState } from '@/data'
import { liveToken } from '@/stores/__tests__/token-helpers'
import { TOKEN_STORAGE_KEY } from '@/stores/auth'
import RefereeLinkPanel from '../components/RefereeLinkPanel.vue'

vi.mock('@/data', () => ({
  getRefereeToken: vi.fn<typeof getRefereeToken>(),
  getRefereeSeats: vi.fn<typeof getRefereeSeats>(),
  freeRefereeSeat: vi.fn<typeof freeRefereeSeat>(),
}))

function fightState(overrides: Partial<OperatorFightState> = {}): OperatorFightState {
  return {
    matchId: 'm1',
    status: 'scheduled',
    remainingMs: 180_000,
    endReason: null,
    robots: { A: { name: 'Tritura' }, B: { name: 'Ferrugem' } },
    score: { A: 0, B: 0 },
    closed: false,
    hasSelectedArena: false,
    winnerSide: null,
    draw: false,
    proposal: null,
    surrenderedSide: null,
    ...overrides,
  }
}

const TOKEN = 'abcdefghijklmnopqrstuv'

async function mountPanel(props: { matchId?: string; state?: OperatorFightState } = {}) {
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
    props: { matchId: 'm1', state: fightState(), ...props },
    global: { plugins: [router] },
  })
  await flushPromises()
  return wrapper
}

describe('RefereeLinkPanel', () => {
  enableAutoUnmount(afterEach)
  const get = vi.mocked(getRefereeToken)
  const getSeats = vi.mocked(getRefereeSeats)
  const free = vi.mocked(freeRefereeSeat)
  let jwt: string

  beforeEach(() => {
    jwt = liveToken()
    localStorage.setItem(TOKEN_STORAGE_KEY, jwt)
    setActivePinia(createPinia())
    get.mockReset()
    get.mockResolvedValue({ token: TOKEN })
    getSeats.mockReset()
    getSeats.mockResolvedValue([
      { seat: 1, name: 'Ana' },
      { seat: 2, name: 'Joao' },
    ])
    free.mockReset()
    free.mockResolvedValue()
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

  it('shows the link on one line with the full value on hover', async () => {
    const wrapper = await mountPanel()
    const link = `${window.location.origin}/referee/${TOKEN}`

    const url = wrapper.get('.referee-link__url')
    expect(url.attributes('title')).toBe(link)
    expect(url.text()).toBe(link)
  })

  it('requests again for another match', async () => {
    const wrapper = await mountPanel()

    await wrapper.setProps({ matchId: 'm2', state: fightState({ matchId: 'm2' }) })
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
    const wrapper = await mountPanel({ state: fightState({ status: 'finished', closed: true }) })

    expect(get).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('/referee/')
  })

  it('hides the link once the fight closes', async () => {
    const wrapper = await mountPanel()

    await wrapper.setProps({ state: fightState({ status: 'finished', closed: true }) })

    expect(wrapper.text()).not.toContain('/referee/')
  })

  it('shows an error when the token cannot be loaded', async () => {
    get.mockRejectedValue(new ApiError(0, 'network'))
    const wrapper = await mountPanel()

    expect(wrapper.find('[role="alert"]').text()).toContain('link dos árbitros')
  })

  const button = (wrapper: Awaited<ReturnType<typeof mountPanel>>, label: string) =>
    wrapper.findAll('button').filter((b) => b.text() === label)

  it('lists seats 1–3 with names and Livre', async () => {
    const wrapper = await mountPanel()

    expect(getSeats).toHaveBeenCalledWith('m1', jwt)
    const rows = wrapper.findAll('li').map((li) => li.text())
    expect(rows[0]).toContain('1')
    expect(rows[0]).toContain('Ana')
    expect(rows[1]).toContain('Joao')
    expect(rows[2]).toContain('Livre')
    expect(button(wrapper, 'Liberar')).toHaveLength(2)
  })

  it('Liberar asks for confirmation, frees the seat and refetches', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = await mountPanel()

    await button(wrapper, 'Liberar')[1]!.trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalledWith('Liberar o lugar de Joao?')
    expect(free).toHaveBeenCalledWith('m1', 2, jwt)
    expect(getSeats).toHaveBeenCalledTimes(2)
    confirm.mockRestore()
  })

  it('does nothing when the confirmation is cancelled', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountPanel()

    await button(wrapper, 'Liberar')[0]!.trigger('click')
    await flushPromises()

    expect(free).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('hides Liberar once the fight has started', async () => {
    const wrapper = await mountPanel({ state: fightState({ status: 'ongoing' }) })

    expect(wrapper.text()).toContain('Ana')
    expect(button(wrapper, 'Liberar')).toHaveLength(0)
  })

  it('refetches the seats when a new state arrives', async () => {
    const wrapper = await mountPanel()

    await wrapper.setProps({ state: fightState() })
    await flushPromises()

    expect(getSeats).toHaveBeenCalledTimes(2)
  })

  it('a failed free shows an alert', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    free.mockRejectedValue(new ApiError(0, 'network'))
    const wrapper = await mountPanel()

    await button(wrapper, 'Liberar')[0]!.trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe('Não foi possível liberar o lugar.')
    confirm.mockRestore()
  })

  it('a 409 on free refetches without an alert', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    free.mockRejectedValue(new ApiError(409, 'match_started', ['match_started']))
    const wrapper = await mountPanel()

    await button(wrapper, 'Liberar')[0]!.trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(getSeats).toHaveBeenCalledTimes(2)
    confirm.mockRestore()
  })

  it('keeps the newest seat list when replies arrive out of order', async () => {
    const replies: ((seats: { seat: 1 | 2 | 3; name: string }[]) => void)[] = []
    getSeats.mockImplementation(() => new Promise((resolve) => replies.push(resolve)))
    const wrapper = await mountPanel()
    await wrapper.setProps({ state: fightState() })
    await flushPromises()

    replies[1]!([
      { seat: 1, name: 'Ana' },
      { seat: 2, name: 'Bia' },
    ])
    await flushPromises()
    replies[0]!([{ seat: 1, name: 'Ana' }])
    await flushPromises()

    expect(wrapper.text()).toContain('Bia')
  })
})
