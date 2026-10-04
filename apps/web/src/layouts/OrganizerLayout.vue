<script setup lang="ts">
// Figma: `07 / Organizador · Visão geral` (node 2:15) — `Navigation / App` + `Organizer / Shell`
// (sidebar 21:305, main 21:333). Only the frame is built here; page content goes in <RouterView />.
import { computed, ref, watch } from 'vue'
import { useRoute, type RouteRecordName } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import AppNav from '@/components/ui/AppNav.vue'
import SidebarItem from '@/components/ui/SidebarItem.vue'
import { getChampionship } from '@/mocks'

// Mock: signed-in user's display name (Figma demo data) until auth exists
const userName = 'E. Vidias'

const route = useRoute()

/** Present only on the per-championship routes; `/manage` and `/manage/new` have no sidebar */
const championshipId = computed(() => {
  const param = route.params.championshipId
  return typeof param === 'string' && param !== '' ? param : null
})

const championshipName = ref<string | null>(null)

watch(
  championshipId,
  async (id) => {
    championshipName.value = null
    if (!id) return
    const championship = await getChampionship(id)
    // Ignore a stale response if the user navigated to another championship meanwhile
    if (id === championshipId.value) championshipName.value = championship?.name ?? null
  },
  { immediate: true },
)

const sidebarItems: { routeName: RouteRecordName; label: string }[] = [
  { routeName: 'championship-overview', label: 'Visão geral' },
  { routeName: 'championship-participants', label: 'Participantes' },
  { routeName: 'championship-matches', label: 'Lutas' },
  { routeName: 'championship-settings', label: 'Configurações' },
]
</script>

<template>
  <div class="organizer-layout">
    <AppNav :user-name="userName" active="my-championships" />

    <div class="organizer-layout__shell">
      <aside v-if="championshipId" class="organizer-layout__sidebar">
        <p class="organizer-layout__overline text-overline">Área do organizador</p>
        <p v-if="championshipName" class="organizer-layout__championship text-heading-m">
          {{ championshipName }}
        </p>

        <nav class="organizer-layout__nav" aria-label="Gerenciar campeonato">
          <ul class="organizer-layout__list">
            <li v-for="item in sidebarItems" :key="item.routeName">
              <SidebarItem
                :to="{ name: item.routeName, params: { championshipId } }"
                :active="route.name === item.routeName"
              >
                {{ item.label }}
              </SidebarItem>
            </li>
          </ul>
        </nav>

        <div class="organizer-layout__footer">
          <AppButton
            variant="ghost"
            :to="{ name: 'championship', params: { championshipId } }"
            class="organizer-layout__public-link"
          >
            Ver página pública
          </AppButton>
          <p class="organizer-layout__note text-body-s">
            Somente organizadores autorizados podem alterar este campeonato.
          </p>
        </div>
      </aside>

      <main
        class="organizer-layout__main"
        :class="{ 'organizer-layout__main--full': !championshipId }"
      >
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.organizer-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--color-bg);
}

.organizer-layout__shell {
  display: flex;
  flex: 1 0 auto;
  /* Sidebar and main sit side by side; main wraps below once it would drop under half the width */
  flex-wrap: wrap;
  align-items: stretch;
}

.organizer-layout__sidebar {
  display: flex;
  flex-direction: column;
  flex: 1 0 var(--size-sidebar);
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-7) var(--space-5);
  border-right: 1px solid var(--color-border);
  background: var(--color-panel);
}

.organizer-layout__overline {
  color: var(--color-orange);
}

.organizer-layout__championship {
  color: var(--color-text);
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

.organizer-layout__nav {
  /* Figma: 16px spacer + 8px gap above the first item */
  margin-top: var(--space-4);
}

.organizer-layout__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.organizer-layout__footer {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  /* Figma: 24px spacer, 1px divider, 16px spacer (plus the 8px column gaps) */
  margin-top: var(--space-6);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-soft);
}

.organizer-layout__public-link {
  width: 100%;
  min-width: 0;
}

.organizer-layout__note {
  color: var(--color-muted);
}

.organizer-layout__main {
  flex: 999 1 0;
  min-width: 50%;
  padding: var(--space-8) var(--space-8) var(--space-9);
}

/* Without a sidebar, content lines up with the nav's side padding */
.organizer-layout__main--full {
  min-width: 0;
  padding-inline: var(--space-page-x);
}
</style>
