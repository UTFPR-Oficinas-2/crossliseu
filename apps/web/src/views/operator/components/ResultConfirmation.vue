<script setup lang="ts">
// The closing step of a finished fight (#50): the server's proposed result with Confirm and
// Draw, then the confirmed result once the fight is closed. The server computes the result;
// this component never chooses a winner.
import { computed } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import type { OperatorFightState } from '@/data'

const { state, disabled } = defineProps<{
  state: OperatorFightState
  disabled: boolean
}>()
const emit = defineEmits<{ confirm: []; draw: [] }>()

const other = (side: 'A' | 'B') => (side === 'A' ? 'B' : 'A')
const tally = computed(() => `${state.score.A} × ${state.score.B}`)

/** "Vencedor proposto: X" plus its reason, or the proposed draw */
const proposalText = computed(() => {
  const proposal = state.proposal
  if (!proposal) return null
  if (proposal.outcome === 'draw') return `Empate proposto (placar igual ${tally.value})`
  const winner = `Vencedor proposto: ${state.robots[proposal.outcome].name}`
  return proposal.basis === 'surrender'
    ? `${winner}, por desistência do lado ${other(proposal.outcome)}`
    : `${winner}, por pontos ${tally.value}`
})
const proposesDraw = computed(() => state.proposal?.outcome === 'draw')

const confirmedText = computed(() => {
  if (state.draw) return 'Empate'
  return state.winnerSide ? `Vencedor: ${state.robots[state.winnerSide].name}` : null
})
</script>

<template>
  <section class="result" aria-labelledby="result-title">
    <template v-if="state.closed">
      <h2 id="result-title" class="text-overline">Resultado oficial</h2>
      <p v-if="confirmedText" class="text-heading-m">{{ confirmedText }}</p>
    </template>
    <template v-else>
      <h2 id="result-title" class="text-overline">Resultado proposto</h2>
      <p v-if="proposalText" class="text-heading-m">{{ proposalText }}</p>
      <p class="result__note text-body-s">
        Confirmar fecha a luta: o resultado fica oficial e o link dos árbitros deixa de funcionar.
      </p>
      <div class="result__actions">
        <AppButton :disabled="disabled" @click="emit('confirm')">
          {{ proposesDraw ? 'Confirmar empate' : 'Confirmar resultado' }}
        </AppButton>
        <AppButton
          v-if="!proposesDraw"
          variant="secondary"
          :disabled="disabled"
          @click="emit('draw')"
        >
          Declarar empate
        </AppButton>
      </div>
    </template>
  </section>
</template>

<style scoped>
.result {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.result__note {
  color: var(--color-muted);
}

.result__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
</style>
