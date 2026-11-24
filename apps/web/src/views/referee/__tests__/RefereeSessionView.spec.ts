import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import type { FightChannelOptions } from '@/api/fight-channel'

vi.mock('@/data', () => ({
  joinReferee: vi.fn<typeof import('@/data').joinReferee>(),
  submitScore: vi.fn<typeof import('@/data').submitScore>(),
  getMatchSurrenderedSide: vi.fn<typeof import('@/data').getMatchSurrenderedSide>(),
}))
vi.mock('@/api/fight-channel', () => ({
  openFightChannel: vi.fn<typeof import('@/api/fight-channel').openFightChannel>(),
}))

import { openFightChannel } from '@/api/fight-channel'
import { getMatchSurrenderedSide, joinReferee } from '@/data'
import RefereeSessionView from '../RefereeSessionView.vue'

const KEY = 'crossliseu.referee.tok'
const stub = { render: () => null }

function frame(overrides: Record<string, unknown> = {}) {
  return {
    matchId: 'm-1',
    status: 'scheduled',
    remainingMs: 180_000,
    endReason: null,
    robots: { A: { name: 'Marte' }, B: { name: 'Cobalto' } },
    score: { A: 0, B: 0 },
    ...overrides,
  }
}

enableAutoUnmount(afterEach)

describe('RefereeSessionView', () => {
  let channels: { options: FightChannelOptions; close: ReturnType<typeof vi.fn<() => void>> }[]
  const channel = () => channels[channels.length - 1]!

  async function mountView(token = 'tok') {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/referee/invalid-access', name: 'referee-invalid-access', component: stub },
        {
          path: '/referee/:accessToken',
          name: 'referee-session',
          component: RefereeSessionView,
          props: true,
        },
      ],
    })
    await router.push(`/referee/${token}`)
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
    await flushPromises()
    return { wrapper, router }
  }

  beforeEach(() => {
    localStorage.clear()
    channels = []
    vi.mocked(joinReferee).mockReset()
    vi.mocked(openFightChannel).mockReset()
    vi.mocked(openFightChannel).mockImplementation((options) => {
      const entry = { options, close: vi.fn<() => void>() }
      channels.push(entry)
      return { close: entry.close }
    })
  })

  it('shows the name form without a remembered name and joins with the trimmed name', async () => {
    vi.mocked(joinReferee).mockResolvedValue({
      matchId: 'm-1',
      seat: 1,
      name: 'Ana',
      counts: { A: 0, B: 0 },
    })
    const { wrapper } = await mountView()

    expect(wrapper.text()).toContain('Entrar na luta')
    await wrapper.get('input').setValue('  Ana ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(joinReferee).toHaveBeenCalledWith('tok', 'Ana')
  })

  it('shows the join error on the field', async () => {
    const { wrapper } = await mountView()

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Digite seu nome.')
    expect(joinReferee).not.toHaveBeenCalled()
  })

  it('with a remembered name it connects, then shows the waiting card after a scheduled frame', async () => {
    localStorage.setItem(KEY, 'Ana')
    vi.mocked(joinReferee).mockResolvedValue({
      matchId: 'm-1',
      seat: 1,
      name: 'Ana',
      counts: { A: 0, B: 0 },
    })
    const { wrapper } = await mountView()

    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('Conectando…')
    channel().options.onState(frame())
    await flushPromises()

    expect(wrapper.text()).toContain('ACESSO VALIDADO')
    expect(wrapper.text()).toContain('Marte × Cobalto')
    expect(wrapper.text()).toContain('LADO A')
    expect(wrapper.text()).toContain('Aguardando o operador iniciar')
  })

  it.each(['ongoing', 'paused'])('shows the scoring panel while %s', async (status) => {
    localStorage.setItem(KEY, 'Ana')
    vi.mocked(joinReferee).mockResolvedValue({
      matchId: 'm-1',
      seat: 1,
      name: 'Ana',
      counts: { A: 0, B: 0 },
    })
    const { wrapper } = await mountView()

    channel().options.onState(frame({ status }))
    await flushPromises()

    expect(wrapper.text()).toContain('TEMPO RESTANTE')
    expect(wrapper.text()).not.toContain('Aguardando o operador iniciar')
  })

  it('shows the final totals once finished', async () => {
    localStorage.setItem(KEY, 'Ana')
    vi.mocked(joinReferee).mockResolvedValue({
      matchId: 'm-1',
      seat: 1,
      name: 'Ana',
      counts: { A: 0, B: 0 },
    })
    vi.mocked(getMatchSurrenderedSide).mockResolvedValue('A')
    const { wrapper } = await mountView()

    channel().options.onState(
      frame({ status: 'finished', remainingMs: 0, endReason: 'time_out', score: { A: 8, B: 2 } }),
    )
    await flushPromises()

    expect(wrapper.text()).toContain('LUTA ENCERRADA')
    expect(wrapper.text()).toContain('Pontuação final')
  })

  it('redirects to the invalid-access page when the session becomes invalid', async () => {
    localStorage.setItem(KEY, 'Ana')
    vi.mocked(joinReferee).mockResolvedValue({
      matchId: 'm-1',
      seat: 1,
      name: 'Ana',
      counts: { A: 0, B: 0 },
    })
    const { router } = await mountView()

    channel().options.onStatus('rejected')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('referee-invalid-access')
    // Kept in the URL so "Tentar novamente" survives a reload of the invalid page
    expect(router.currentRoute.value.query.t).toBe('tok')
  })

  it('starts again when the link changes', async () => {
    const { router } = await mountView('tok')
    localStorage.setItem('crossliseu.referee.other', 'Bia')
    vi.mocked(joinReferee).mockResolvedValue({
      matchId: 'm-2',
      seat: 3,
      name: 'Bia',
      counts: { A: 0, B: 0 },
    })

    await router.push('/referee/other')
    await flushPromises()

    expect(joinReferee).toHaveBeenCalledWith('other', 'Bia')
  })

  it('closes the channel when it unmounts', async () => {
    localStorage.setItem(KEY, 'Ana')
    vi.mocked(joinReferee).mockResolvedValue({
      matchId: 'm-1',
      seat: 1,
      name: 'Ana',
      counts: { A: 0, B: 0 },
    })
    const { wrapper } = await mountView()

    wrapper.unmount()

    expect(channel().close).toHaveBeenCalled()
  })
})
