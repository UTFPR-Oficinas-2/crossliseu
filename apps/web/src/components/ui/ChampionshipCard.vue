<script setup lang="ts">
// Figma: `Card / Championship` (node 11:37) and its PUB-01 instances
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import StatusPill from '@/components/ui/StatusPill.vue'
// Championship state only. Recording/upload states are separate and never shown here.
import type { ChampionshipStatus } from '@/types'
import { championshipStatusPill, formatDateRange } from '@/utils/championship'

const {
  name,
  startDate,
  endDate = null,
  status,
  fightsDone,
  fightsTotal,
  to = '/',
} = defineProps<{
  name: string
  /** ISO date ("2026-12-09") */
  startDate: string
  /** ISO date; the card shows a range when it differs from `startDate` */
  endDate?: string | null
  status: ChampionshipStatus
  fightsDone: number
  fightsTotal: number
  /** Championship page */
  to?: RouteLocationRaw
}>()

const pill = computed(() => championshipStatusPill[status])

// "09 DEZ 2026", "19 – 20 DEZ 2026"
const formattedDate = computed(() => formatDateRange(startDate, endDate).toUpperCase())

const numberFormat = new Intl.NumberFormat('pt-BR')

// "6 de 15 lutas"; a scheduled championship has no progress to report
const summary = computed(() =>
  status === 'scheduled'
    ? null
    : `${numberFormat.format(fightsDone)} de ${numberFormat.format(fightsTotal)} ${
        fightsTotal === 1 ? 'luta' : 'lutas'
      }`,
)

const progress = computed(() => {
  if (status === 'scheduled' || fightsTotal <= 0) return 0
  return Math.min(100, Math.max(0, (fightsDone / fightsTotal) * 100))
})
</script>

<template>
  <article class="championship-card">
    <header class="championship-card__header">
      <StatusPill :label="pill.label" :tone="pill.tone" />
    </header>

    <h3 class="championship-card__name text-heading-m">{{ name }}</h3>

    <p class="championship-card__date text-mono-m">{{ formattedDate }}</p>

    <!-- Decorative: the footer text states the same progress -->
    <div class="championship-card__track" aria-hidden="true">
      <div
        class="championship-card__bar"
        :class="{ 'championship-card__bar--done': status === 'closed' }"
        :style="{ width: `${progress}%` }"
      />
    </div>

    <footer class="championship-card__footer">
      <p v-if="summary" class="championship-card__summary text-body-s">{{ summary }}</p>
      <RouterLink :to="to" class="championship-card__link text-label-s">
        Ver campeonato <span aria-hidden="true">→</span>
      </RouterLink>
    </footer>
  </article>
</template>

<style scoped>
.championship-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-14px);
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.championship-card__header,
.championship-card__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.championship-card__name {
  color: var(--color-text);
  text-transform: uppercase;
  overflow-wrap: break-word;
}

.championship-card__date {
  color: var(--color-text);
}

.championship-card__track {
  display: flex;
  height: var(--space-6px);
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--color-raised);
}

.championship-card__bar {
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--color-orange);
}

.championship-card__bar--done {
  background: var(--color-green);
}

.championship-card__summary {
  color: var(--color-muted);
}

.championship-card__link {
  color: var(--color-orange);
  text-decoration: none;
  white-space: nowrap;
}

.championship-card__link:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-orange);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-xs);
}
</style>
