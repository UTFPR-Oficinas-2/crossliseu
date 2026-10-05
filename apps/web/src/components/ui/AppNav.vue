<script setup lang="ts">
// Figma: `Navigation / App` (node 10:40) — top navigation for signed-in organizer pages.
import { computed } from 'vue'
import { useRouter, type RouteLocationRaw } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'

export interface AppNavItem {
  /** Stable key, matched against the `active` prop */
  id: string
  label: string
  to: RouteLocationRaw
}

const {
  userName,
  items = [
    { id: 'championships', label: 'Campeonatos', to: { name: 'home' } },
    { id: 'my-championships', label: 'Meus campeonatos', to: { name: 'my-championships' } },
  ],
  active,
  homeTo = { name: 'home' },
} = defineProps<{
  /** Signed-in user's display name, e.g. "E. Vidias" */
  userName: string
  items?: AppNavItem[]
  /** `id` of the current item; it gets aria-current="page" */
  active?: string
  /** Where the logo links to */
  homeTo?: RouteLocationRaw
}>()

const emit = defineEmits<{ signOut: [] }>()

// Never link to a named route that isn't registered (e.g. `my-championships` in production)
const router = useRouter()
const visibleItems = computed(() =>
  items.filter((item) => {
    const to = item.to
    return typeof to === 'string' || !('name' in to) || !to.name || router.hasRoute(to.name)
  }),
)
</script>

<template>
  <header class="app-nav">
    <RouterLink :to="homeTo" class="app-nav__logo text-heading-l">Crossliseu</RouterLink>

    <div class="app-nav__right">
      <nav aria-label="Navegação principal">
        <ul class="app-nav__list">
          <li v-for="item in visibleItems" :key="item.id">
            <RouterLink
              :to="item.to"
              class="app-nav__link text-body-m"
              :class="{ 'app-nav__link--active': item.id === active }"
              :aria-current="item.id === active ? 'page' : undefined"
            >
              {{ item.label }}
            </RouterLink>
          </li>
        </ul>
      </nav>

      <div class="app-nav__account">
        <!-- Figma avatar is a plain orangeDim circle (no initials or image) -->
        <span class="app-nav__avatar" aria-hidden="true" />
        <span class="app-nav__user text-label-s">{{ userName }}</span>
      </div>

      <AppButton variant="ghost" type="button" @click="emit('signOut')">Sair</AppButton>
    </div>
  </header>
</template>

<style scoped>
.app-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4) var(--space-7);
  min-height: var(--size-nav-height);
  padding: var(--space-4) var(--space-page-x);
  border-bottom: 1px solid var(--color-border-soft);
  background: var(--color-bg);
}

.app-nav__logo {
  color: var(--color-text);
  text-decoration: none;
  text-transform: uppercase;
  white-space: nowrap;
}

.app-nav__right {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4) var(--space-7);
  min-width: 0;
}

.app-nav__list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-7);
  margin: 0;
  padding: 0;
  list-style: none;
}

.app-nav__link {
  color: var(--color-muted);
  text-decoration: none;
  white-space: nowrap;
}

.app-nav__link--active {
  color: var(--color-text);
}

.app-nav__logo:focus-visible,
.app-nav__link:focus-visible {
  /* Figma has no focus state; ring in the primary action color */
  outline: var(--focus-ring-width) solid var(--color-orange);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-xs);
}

.app-nav__account {
  display: inline-flex;
  align-items: center;
  gap: var(--space-10px);
  min-width: 0;
  padding: var(--space-2) var(--space-4) var(--space-2) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-raised);
}

.app-nav__avatar {
  flex-shrink: 0;
  width: var(--size-avatar);
  height: var(--size-avatar);
  border-radius: var(--radius-pill);
  background: var(--color-orange-dim);
}

.app-nav__user {
  min-width: 0;
  color: var(--color-text);
  overflow-wrap: anywhere;
}
</style>
