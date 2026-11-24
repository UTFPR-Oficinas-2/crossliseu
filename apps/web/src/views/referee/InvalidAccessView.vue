<script setup lang="ts">
// Figma: ARB-05 `Acesso inválido` (node 27:554). Reached by redirect from the session view when
// the link is unknown, the fight was confirmed, the operator freed this referee's seat, or the
// fight already has three referees. The reason comes from the `referee` store, which keeps it
// after the session view unmounts.
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import { useRefereeStore } from '@/stores/referee'

const route = useRoute()
const router = useRouter()
const referee = useRefereeStore()

const copy = computed(() =>
  referee.invalidReason === 'seats_full'
    ? {
        pill: 'SEM VAGA',
        title: 'Esta luta já tem 3 árbitros',
        text: 'Os três lugares de árbitro desta luta já foram ocupados por outros nomes.',
        steps: [
          'Se você já entrou antes, use exatamente o mesmo nome.',
          'Peça ao operador para liberar uma vaga.',
        ],
      }
    : {
        pill: 'ACESSO EXPIRADO',
        title: 'Este link não vale mais',
        text: 'Este link não existe, a luta desta arbitragem já teve o resultado confirmado ou seu lugar foi liberado pelo operador.',
        steps: [
          'Peça ao operador o link certo para esta luta.',
          'Confirme que você está na luta certa.',
        ],
      },
)

/** The link from the store, or from the URL after this page was reloaded */
const token = computed(() => {
  const fromUrl = route.query.t
  return referee.token ?? (typeof fromUrl === 'string' && fromUrl ? fromUrl : null)
})

/** Figma: reloads the same link */
function retry() {
  if (token.value) {
    void router.replace({ name: 'referee-session', params: { accessToken: token.value } })
  } else {
    window.location.reload()
  }
}
</script>

<template>
  <section class="invalid-access" aria-labelledby="invalid-access-title">
    <StatusPill :label="copy.pill" tone="danger" />
    <h1 id="invalid-access-title" class="invalid-access__title text-display-page">
      {{ copy.title }}
    </h1>
    <p class="invalid-access__text text-body-l">{{ copy.text }}</p>

    <div class="invalid-access__card">
      <h2 class="invalid-access__card-title text-heading-s">O que fazer</h2>
      <ul class="invalid-access__steps">
        <li v-for="step in copy.steps" :key="step" class="invalid-access__step text-body-s">
          {{ step }}
        </li>
      </ul>
    </div>

    <AppButton variant="secondary" class="invalid-access__retry" @click="retry">
      Tentar novamente
    </AppButton>
  </section>
</template>

<style scoped>
.invalid-access {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
  padding-top: var(--space-referee-invalid-top);
}

.invalid-access__title {
  color: var(--color-text);
  text-transform: uppercase;
}

.invalid-access__text {
  color: var(--color-muted);
}

.invalid-access__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-10px);
  width: 100%;
  padding: var(--space-18px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.invalid-access__card-title {
  color: var(--color-text);
  text-transform: uppercase;
}

.invalid-access__steps {
  display: flex;
  flex-direction: column;
  gap: var(--space-10px);
  margin: 0;
  padding: 0;
  list-style: none;
}

.invalid-access__step {
  display: flex;
  gap: var(--space-10px);
  color: var(--color-muted);
}

.invalid-access__step::before {
  content: '·';
  flex-shrink: 0;
  width: var(--space-2);
  color: var(--color-orange);
}

/* Full-width touch target, at least 48 px on the phone */
.invalid-access__retry {
  width: 100%;
  min-height: var(--size-control-lg);
}
</style>
