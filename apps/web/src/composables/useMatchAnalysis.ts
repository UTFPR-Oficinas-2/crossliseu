import { computed, getCurrentInstance, onBeforeUnmount, ref } from 'vue'
import { getMatchAnalysis } from '@/data'
import type { MatchAnalysis } from '@/types'

/** How often to ask again while the CV worker has the video queued or running */
export const ANALYSIS_POLL_MS = 3_000

/**
 * The analysis of a match's uploaded video (#21). `refresh()` reads it once; while it is pending or
 * processing it keeps asking every ANALYSIS_POLL_MS until it ends, the view goes away or `stop()`.
 *
 * `analysis` is null while the match has no uploaded video yet.
 */
export function useMatchAnalysis(matchId: () => string, token: () => string) {
  const analysis = ref<MatchAnalysis | null>(null)
  /** loading -> first answer pending; ready -> `analysis` is current; error -> last read failed */
  const loadState = ref<'loading' | 'ready' | 'error'>('loading')

  let timer: ReturnType<typeof setTimeout> | undefined
  // Each read gets a number: an answer that arrives after a newer read started is dropped
  let latest = 0
  let stopped = false

  const inProgress = computed(
    () => analysis.value?.status === 'pending' || analysis.value?.status === 'processing',
  )

  async function refresh() {
    clearTimeout(timer)
    stopped = false
    const read = ++latest
    try {
      const answer = await getMatchAnalysis(matchId(), token())
      if (read !== latest) return
      analysis.value = answer
      loadState.value = 'ready'
    } catch {
      if (read !== latest) return
      loadState.value = 'error'
      return
    }
    if (inProgress.value && !stopped) timer = setTimeout(refresh, ANALYSIS_POLL_MS)
  }

  function stop() {
    stopped = true
    latest++
    clearTimeout(timer)
  }

  if (getCurrentInstance()) onBeforeUnmount(stop)

  return { analysis, loadState, inProgress, refresh, stop }
}
