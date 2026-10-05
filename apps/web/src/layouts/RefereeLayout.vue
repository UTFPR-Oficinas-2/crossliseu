<script setup lang="ts">
// Figma: `15 / Árbitro · Pontuação` (node 26:544), designed at 390 × 844. Shared frame for the
// referee screens: the compact `Referee / Header` with the seat tag and the mobile content
// padding. The page content (join, scoring, finished, invalid access) is rendered by the child
// route.
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getRefereeAccess } from '@/mocks'
import type { RefereeAccess } from '@/types'

/** Every match has exactly three referee seats (see `RefereeSeat`) */
const SEAT_COUNT = 3

const route = useRoute()

const access = ref<RefereeAccess | null>(null)

// Data loading lives here so it can be swapped for the API later.
let loadId = 0
async function load(token: string | null) {
  const current = ++loadId
  if (!token) {
    access.value = null
    return
  }
  const loaded = await getRefereeAccess(token)
  // Ignore a stale response if the token changed while loading
  if (current === loadId) access.value = loaded
}

const accessToken = computed(() => {
  if (route.name === 'referee-invalid-access') return null
  const param = route.params.accessToken
  return typeof param === 'string' && param ? param : null
})

watch(accessToken, (token) => load(token), { immediate: true })

/** Unknown or expired links show the header without the tag */
const roleLabel = computed(() => {
  if (!accessToken.value || !access.value || access.value.expired) return null
  return `ÁRBITRO ${access.value.seat} DE ${SEAT_COUNT}`
})
</script>

<template>
  <div class="referee-layout">
    <header class="referee-layout__header">
      <div class="referee-layout__header-inner">
        <p class="referee-layout__brand text-heading-s">Crossliseu</p>
        <span v-if="roleLabel" class="referee-layout__role text-mono-s">{{ roleLabel }}</span>
      </div>
    </header>

    <main class="referee-layout__content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.referee-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--color-bg);
}

/* Bar spans the full width; its content keeps the 390 px Figma frame on wider screens */
.referee-layout__header {
  flex-shrink: 0;
  padding-top: env(safe-area-inset-top);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-panel);
}

.referee-layout__header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  width: 100%;
  max-width: var(--size-referee-frame);
  min-height: var(--size-nav-referee-height);
  margin: 0 auto;
  padding: 0 max(var(--space-5), env(safe-area-inset-right)) 0
    max(var(--space-5), env(safe-area-inset-left));
}

.referee-layout__brand {
  min-width: 0;
  color: var(--color-text);
  text-transform: uppercase;
  white-space: nowrap;
}

.referee-layout__role {
  flex-shrink: 0;
  padding: var(--space-5px) var(--space-10px);
  border: 1px solid var(--color-orange);
  border-radius: var(--radius-3px);
  background: var(--color-orange-dim);
  color: var(--color-orange);
  white-space: nowrap;
}

.referee-layout__content {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  gap: var(--space-4);
  width: 100%;
  max-width: var(--size-referee-frame);
  margin: 0 auto;
  padding: var(--space-5) max(var(--space-5), env(safe-area-inset-right))
    calc(var(--space-6) + env(safe-area-inset-bottom))
    max(var(--space-5), env(safe-area-inset-left));
}
</style>
