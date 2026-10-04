<script setup lang="ts">
// Figma: `01 / Público · Home` (node 2:13). Shared frame for public pages: top navigation and
// the page content area (`Home / Content` padding). Page blocks live in each view.
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppNav from '@/components/ui/AppNav.vue'
import PublicNav from '@/components/ui/PublicNav.vue'

// Mock: stand-in until auth exists. Signed out shows `Navigation / Public`, signed in shows
// `Navigation / App`.
const isSignedIn = false
// Mock: demo user name from Figma (`Navigation / App`)
const userName = 'E. Vidias'

// Public routes that belong to the "Campeonatos" nav item
const championshipRoutes = ['home', 'championship', 'match-details']

const route = useRoute()

const activeNavItem = computed(() =>
  championshipRoutes.includes(String(route.name)) ? 'championships' : undefined,
)
</script>

<template>
  <div class="public-layout">
    <AppNav v-if="isSignedIn" :user-name="userName" :active="activeNavItem" />
    <PublicNav v-else />

    <main class="public-layout__content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.public-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--color-bg);
}

.public-layout__content {
  flex: 1;
  width: 100%;
  /* Left-aligned so the content edge lines up with the nav logo on wide screens */
  max-width: var(--size-page-max);
  min-width: 0;
  padding: var(--space-page-y) var(--space-page-x);
}
</style>
