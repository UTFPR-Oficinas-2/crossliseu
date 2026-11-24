import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMatchAnalysis } from '@/data'
import type { MatchAnalysis } from '@/types'
import { ANALYSIS_POLL_MS } from '@/composables/useMatchAnalysis'
import MatchAnalysisPanel from '../components/MatchAnalysisPanel.vue'

vi.mock('@/data', () => ({ getMatchAnalysis: vi.fn<typeof getMatchAnalysis>() }))

const ROBOTS = { A: 'Tritura', B: 'Ferrugem' }

function completed(overrides: Partial<MatchAnalysis> = {}): MatchAnalysis {
  return {
    status: 'completed',
    error: null,
    mock: false,
    totalFrames: 450,
    heatmaps: [
      {
        robotId: 'ra',
        side: 'A',
        status: 'completed',
        detectedPositions: 440,
        imageUrl: 'https://r2.example/a.png?sig',
      },
      {
        robotId: 'rb',
        side: 'B',
        status: 'completed',
        detectedPositions: 12,
        imageUrl: 'https://r2.example/b.png?sig',
      },
    ],
    ...overrides,
  }
}

async function mountPanel(uploads = 0) {
  const wrapper = mount(MatchAnalysisPanel, {
    props: { matchId: 'm1', robots: ROBOTS, uploads },
  })
  await flushPromises()
  return wrapper
}

describe('MatchAnalysisPanel', () => {
  enableAutoUnmount(afterEach)
  const get = vi.mocked(getMatchAnalysis)

  beforeEach(() => {
    setActivePinia(createPinia())
    get.mockReset()
  })

  it('before any upload: says the analysis starts with the video', async () => {
    get.mockResolvedValue(null)

    const wrapper = await mountPanel()

    expect(wrapper.text()).toContain('Sem vídeo')
    expect(wrapper.text()).toContain('A análise começa quando o vídeo da luta é enviado.')
  })

  it('while running: status only', async () => {
    get.mockResolvedValue({ ...completed(), status: 'processing', heatmaps: [] })

    const wrapper = await mountPanel()

    expect(wrapper.text()).toContain('Processando')
    expect(wrapper.findAll('img')).toHaveLength(0)
  })

  it('done: one heatmap per side, with the robot name and the frame count', async () => {
    get.mockResolvedValue(completed())

    const wrapper = await mountPanel()

    const images = wrapper.findAll('img')
    expect(images.map((img) => img.attributes('src'))).toEqual([
      'https://r2.example/a.png?sig',
      'https://r2.example/b.png?sig',
    ])
    expect(images[0]!.attributes('alt')).toBe('Mapa de calor do lado A, Tritura')
    expect(wrapper.text()).toContain('Lado B · Ferrugem')
    expect(wrapper.text()).toContain('Encontrado em 440 de 450 quadros')
    expect(wrapper.text()).not.toContain('Modo de teste')
  })

  it('warns when the heatmaps came from the test video (mock mode)', async () => {
    get.mockResolvedValue(completed({ mock: true }))

    const wrapper = await mountPanel()

    expect(wrapper.text()).toContain('Modo de teste')
  })

  it('failed: explains the error code', async () => {
    get.mockResolvedValue({
      ...completed(),
      status: 'failed',
      error: 'queue_unavailable',
      heatmaps: [],
    })

    const wrapper = await mountPanel()

    expect(wrapper.text()).toContain('Falhou')
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'serviço de análise não estava disponível',
    )
  })

  it('reads again after a new upload', async () => {
    get.mockResolvedValueOnce(null).mockResolvedValueOnce(completed())
    const wrapper = await mountPanel(0)

    await wrapper.setProps({ uploads: 1 })
    await flushPromises()

    expect(get).toHaveBeenCalledTimes(2)
    expect(wrapper.findAll('img')).toHaveLength(2)
  })

  it('asks for fresh image URLs once when an image fails to load (expired link)', async () => {
    get.mockResolvedValue(completed())
    const wrapper = await mountPanel()

    await wrapper.findAll('img')[0]!.trigger('error')
    await flushPromises()
    await wrapper.findAll('img')[1]!.trigger('error')
    await flushPromises()

    expect(get).toHaveBeenCalledTimes(2)
  })

  it('asks again each time a new set of image URLs expires', async () => {
    const fresh = completed()
    fresh.heatmaps = fresh.heatmaps.map((h) => ({ ...h, imageUrl: `${h.imageUrl}2` }))
    get.mockResolvedValueOnce(completed()).mockResolvedValueOnce(fresh).mockResolvedValue(fresh)
    const wrapper = await mountPanel()

    await wrapper.findAll('img')[0]!.trigger('error')
    await flushPromises()
    expect(wrapper.findAll('img')[0]!.attributes('src')).toBe('https://r2.example/a.png?sig2')
    await wrapper.findAll('img')[0]!.trigger('error')
    await flushPromises()

    expect(get).toHaveBeenCalledTimes(3)
  })

  it('a failed read keeps the last status on screen, with a warning', async () => {
    vi.useFakeTimers()
    try {
      get
        .mockResolvedValueOnce({ ...completed(), status: 'processing', heatmaps: [] })
        .mockRejectedValueOnce(new Error('offline'))
      const wrapper = await mountPanel()

      await vi.advanceTimersByTimeAsync(ANALYSIS_POLL_MS)
      await flushPromises()

      expect(wrapper.text()).toContain('Processando')
      expect(wrapper.text()).toContain('Sem resposta do servidor. Tentando de novo…')
      expect(wrapper.text()).not.toContain('Não foi possível carregar a análise.')
      expect(wrapper.find('button').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('load error: offers to try again', async () => {
    get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(null)
    const wrapper = await mountPanel()

    expect(wrapper.text()).toContain('Não foi possível carregar a análise.')
    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Sem vídeo')
  })
})
