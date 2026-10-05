<script setup lang="ts">
// Figma: `Navigation / Public` (node 2:20). Wordmark on the left; links and the sign-in action
// on the right. RouterLink sets aria-current="page" on the exact-active link by itself.
// No sign-up link: there is no public self-registration.
import { useRouter } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'

// Never link to a route that isn't registered
const canSignIn = useRouter().hasRoute('sign-in')
</script>

<template>
  <header class="public-nav">
    <RouterLink :to="{ name: 'home' }" class="public-nav__brand text-heading-l"
      >Crossliseu</RouterLink
    >

    <nav class="public-nav__right" aria-label="Navegação principal">
      <RouterLink :to="{ name: 'home' }" class="public-nav__link text-body-m"
        >Campeonatos</RouterLink
      >

      <!-- Right-side actions; defaults to the sign-in link from Figma -->
      <slot name="actions">
        <AppButton v-if="canSignIn" variant="secondary" :to="{ name: 'sign-in' }">Entrar</AppButton>
      </slot>
    </nav>
  </header>
</template>

<style scoped>
.public-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-height: var(--size-nav-height);
  padding: var(--space-4) var(--space-page-x);
  border-bottom: 1px solid var(--color-border-soft);
  background: var(--color-bg);
}

.public-nav__brand {
  color: var(--color-text);
  text-decoration: none;
  text-transform: uppercase;
  white-space: nowrap;
}

.public-nav__right {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-7);
}

.public-nav__link {
  color: var(--color-text);
  text-decoration: none;
  white-space: nowrap;
}

.public-nav__brand:focus-visible,
.public-nav__link:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-orange);
  outline-offset: var(--focus-ring-offset);
}
</style>
