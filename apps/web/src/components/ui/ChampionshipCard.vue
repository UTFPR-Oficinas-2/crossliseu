<script setup lang="ts">
// Figma: `Card / Championship` (node 11:37)
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import StatusPill from '@/components/ui/StatusPill.vue'

// Championship state only. Recording/upload states are separate and never shown here.
type ChampionshipStatus = 'scheduled' | 'running' | 'finished'

const {
  name,
  edition,
  date,
  status,
  robotCount,
  fightsDone,
  fightsTotal,
  to = '/',
} = defineProps<{
  name: string
  edition: number
  /** Date object or ISO string ("2026-12-09") */
  date: Date | string
  status: ChampionshipStatus
  robotCount: number
  fightsDone: number
  fightsTotal: number
  /** Championship page; placeholder until routes exist */
  to?: RouteLocationRaw
}>()

const pill = computed(() => {
  switch (status) {
    case 'running':
      return { label: 'Em andamento', tone: 'live' as const }
    case 'finished':
      // TODO design: Figma only defines "Em andamento"
      return { label: 'Encerrado', tone: 'neutral' as const }
    default:
      // TODO design: Figma only defines "Em andamento"
      return { label: 'Agendado', tone: 'neutral' as const }
  }
})

const editionLabel = computed(() => `EDIÇÃO ${String(edition).padStart(2, '0')}`) // 1 → "EDIÇÃO 01"

const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

// "09 DEZ 2026"
const formattedDate = computed(() => {
  const value = typeof date === 'string' ? new Date(date) : date
  const parts = dateFormat.formatToParts(value)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${get('day')} ${get('month').replace('.', '')} ${get('year')}`.toUpperCase()
})

const numberFormat = new Intl.NumberFormat('pt-BR')

// "16 robôs · 6 de 15 lutas"
const summary = computed(() => {
  const robots = `${numberFormat.format(robotCount)} ${robotCount === 1 ? 'robô' : 'robôs'}`
  const fights = `${numberFormat.format(fightsDone)} de ${numberFormat.format(fightsTotal)} ${
    fightsTotal === 1 ? 'luta' : 'lutas'
  }`
  return `${robots} · ${fights}`
})

const progress = computed(() => {
  if (fightsTotal <= 0) return 0
  return Math.min(100, Math.max(0, (fightsDone / fightsTotal) * 100))
})
</script>

<template>
  <article class="championship-card">
    <header class="championship-card__header">
      <StatusPill :label="pill.label" :tone="pill.tone" />
      <p class="championship-card__edition text-mono-s">{{ editionLabel }}</p>
    </header>

    <h3 class="championship-card__name text-heading-m">{{ name }}</h3>

    <p class="championship-card__date text-mono-m">{{ formattedDate }}</p>

    <!-- Decorative: the footer text states the same progress -->
    <div class="championship-card__track" aria-hidden="true">
      <div class="championship-card__bar" :style="{ width: `${progress}%` }" />
    </div>

    <footer class="championship-card__footer">
      <p class="championship-card__summary text-body-s">{{ summary }}</p>
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

.championship-card__edition {
  color: var(--color-muted);
  white-space: nowrap;
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
