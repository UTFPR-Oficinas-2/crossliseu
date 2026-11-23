import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMatchAnalysis } from '@/data'
import type { MatchAnalysis, ProcessingStatus } from '@/types'
import { ANALYSIS_POLL_MS, useMatchAnalysis } from '../useMatchAnalysis'

vi.mock('@/data', () => ({ getMatchAnalysis: vi.fn<typeof getMatchAnalysis>() }))

function analysis(status: ProcessingStatus): MatchAnalysis {
  return { status, error: null, mock: false, totalFrames: null, heatmaps: [] }
}

describe('useMatchAnalysis', () => {
  const get = vi.mocked(getMatchAnalysis)

  beforeEach(() => {
    vi.useFakeTimers()
    get.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('reads once and stops when the analysis is over', async () => {
    get.mockResolvedValue(analysis('completed'))
    const {
      analysis: current,
      loadState,
      refresh,
    } = useMatchAnalysis(
      () => 'm1',
      () => 'jwt',
    )

    await refresh()
    await vi.advanceTimersByTimeAsync(ANALYSIS_POLL_MS * 3)

    expect(get).toHaveBeenCalledExactlyOnceWith('m1', 'jwt')
    expect(loadState.value).toBe('ready')
    expect(current.value?.status).toBe('completed')
  })

  it('keeps asking while pending or processing, until it ends', async () => {
    get
      .mockResolvedValueOnce(analysis('pending'))
      .mockResolvedValueOnce(analysis('processing'))
      .mockResolvedValueOnce(analysis('completed'))
    const { analysis: current, refresh } = useMatchAnalysis(
      () => 'm1',
      () => 'jwt',
    )

    await refresh()
    expect(current.value?.status).toBe('pending')
    await vi.advanceTimersByTimeAsync(ANALYSIS_POLL_MS)
    expect(current.value?.status).toBe('processing')
    await vi.advanceTimersByTimeAsync(ANALYSIS_POLL_MS)
    expect(current.value?.status).toBe('completed')
    await vi.advanceTimersByTimeAsync(ANALYSIS_POLL_MS * 3)

    expect(get).toHaveBeenCalledTimes(3)
  })

  it('null while the match has no uploaded video, and no polling', async () => {
    get.mockResolvedValue(null)
    const {
      analysis: current,
      loadState,
      refresh,
    } = useMatchAnalysis(
      () => 'm1',
      () => 'jwt',
    )

    await refresh()
    await vi.advanceTimersByTimeAsync(ANALYSIS_POLL_MS * 2)

    expect(current.value).toBeNull()
    expect(loadState.value).toBe('ready')
    expect(get).toHaveBeenCalledOnce()
  })

  it('error state when the read fails, keeping the last answer', async () => {
    get.mockResolvedValueOnce(analysis('pending')).mockRejectedValueOnce(new Error('offline'))
    const {
      analysis: current,
      loadState,
      refresh,
    } = useMatchAnalysis(
      () => 'm1',
      () => 'jwt',
    )

    await refresh()
    await vi.advanceTimersByTimeAsync(ANALYSIS_POLL_MS)
    await flushPromises()

    expect(loadState.value).toBe('error')
    expect(current.value?.status).toBe('pending')
  })

  it('stop() ends the polling', async () => {
    get.mockResolvedValue(analysis('processing'))
    const { refresh, stop } = useMatchAnalysis(
      () => 'm1',
      () => 'jwt',
    )

    await refresh()
    stop()
    await vi.advanceTimersByTimeAsync(ANALYSIS_POLL_MS * 3)

    expect(get).toHaveBeenCalledOnce()
  })
})
