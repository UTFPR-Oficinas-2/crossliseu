<script setup lang="ts">
// The closing step of a finished fight (#50): the server's proposed result with Confirm and
// Draw, then the confirmed result once the fight is closed. Before closing, the operator can
// correct the end reason (#57, Figma OPE-20); the server recomputes the proposal. The server
// computes the result; this component never chooses a winner.
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import ChoiceItem from '@/components/ui/ChoiceItem.vue'
import type { EndReasonCorrection, OperatorFightState } from '@/data'

const { state, disabled } = defineProps<{
  state: OperatorFightState
  disabled: boolean
}>()
const emit = defineEmits<{ confirm: []; draw: []; correct: [correction: EndReasonCorrection] }>()

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

/** One radio per end reason; a surrender is one choice per side, so the side is never missing */
type ReasonChoice = 'time_out' | 'manual' | 'surrender:A' | 'surrender:B'

const currentChoice = computed<ReasonChoice | null>(() => {
  if (state.endReason === 'surrender') {
    return state.surrenderedSide ? `surrender:${state.surrenderedSide}` : null
  }
  return state.endReason
})
const choices = computed(() => {
  const surrender = (side: 'A' | 'B') => ({
    value: `surrender:${side}` as const,
    title: `Desistência do lado ${side} · ${state.robots[side].name}`,
    meta: `${state.robots[side].name} desistiu`,
  })
  return [
    { value: 'time_out' as const, title: 'Tempo esgotado', meta: 'O cronômetro chegou a zero' },
    {
      value: 'manual' as const,
      title: 'Encerrada pelo operador',
      meta: 'O operador encerrou a luta',
    },
    surrender('A'),
    surrender('B'),
  ].map((choice) => ({
    ...choice,
    meta: choice.value === currentChoice.value ? 'Motivo atual' : choice.meta,
  }))
})

const editing = ref(false)
const draft = ref<string | null>(null)
const changed = computed(() => draft.value !== null && draft.value !== currentChoice.value)
const editor = useTemplateRef<HTMLFieldSetElement>('editor')
const actions = useTemplateRef<HTMLDivElement>('actions')

// Keyboard users land on the checked reason when the editor opens, and back on its button when
// it closes, instead of on <body>
async function startEditing() {
  draft.value = currentChoice.value
  editing.value = true
  await nextTick()
  const checked = editor.value?.querySelector<HTMLInputElement>('input:checked')
  const first = editor.value?.querySelector<HTMLInputElement>('input')
  ;(checked ?? first)?.focus()
}

async function stopEditing() {
  editing.value = false
  await nextTick()
  actions.value?.querySelector<HTMLButtonElement>('button')?.focus()
}

// The editor closes once the server reports the saved reason, so a failed save keeps the choice
watch(currentChoice, (current) => {
  if (editing.value && current !== null && current === draft.value) void stopEditing()
})

function save() {
  const choice = draft.value as ReasonChoice
  const [endReason, side] = choice.split(':') as [EndReasonCorrection['endReason'], ('A' | 'B')?]
  emit('correct', side ? { endReason, side } : { endReason })
}
</script>

<template>
  <section class="result" aria-labelledby="result-title">
    <template v-if="state.closed">
      <h2 id="result-title" class="text-overline">Resultado oficial</h2>
      <p class="text-heading-m">{{ confirmedText ?? 'Resultado não registrado' }}</p>
    </template>
    <template v-else>
      <h2 id="result-title" class="text-overline">Resultado proposto</h2>
      <p v-if="proposalText" class="text-heading-m">{{ proposalText }}</p>
      <p class="result__note text-body-s">
        Confirmar fecha a luta: o resultado fica oficial e o link dos árbitros deixa de funcionar.
      </p>
      <div ref="actions" class="result__actions">
        <AppButton v-if="!editing" variant="secondary" :disabled="disabled" @click="startEditing">
          Editar resultado
        </AppButton>
        <AppButton :disabled="disabled || editing" @click="emit('confirm')">
          {{ proposesDraw ? 'Confirmar empate' : 'Confirmar resultado' }}
        </AppButton>
        <AppButton
          v-if="!proposesDraw"
          variant="secondary"
          :disabled="disabled || editing"
          @click="emit('draw')"
        >
          Declarar empate
        </AppButton>
      </div>

      <fieldset v-if="editing" ref="editor" class="result__edit">
        <legend class="result__edit-title text-heading-m">Editar resultado</legend>
        <p class="result__note text-body-s">
          Ajuste o motivo do encerramento antes de confirmar. A vencedora é recalculada: na
          desistência vence o outro lado; sem desistência, o maior total; totais iguais são empate.
        </p>
        <ChoiceItem
          v-for="choice in choices"
          :key="choice.value"
          v-model="draft"
          name="end-reason"
          :value="choice.value"
          :title="choice.title"
          :meta="choice.meta"
        />
        <div class="result__actions">
          <AppButton :disabled="disabled || !changed" @click="save">Salvar resultado</AppButton>
          <AppButton variant="ghost" @click="stopEditing">Cancelar</AppButton>
        </div>
      </fieldset>
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

.result__edit {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  margin: 0;
  padding: var(--space-6);
  border: 1px solid var(--color-orange);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

/* A legend sits on the fieldset border unless it floats into the flow */
.result__edit-title {
  float: left;
  width: 100%;
  padding: 0;
  color: var(--color-text);
  text-transform: uppercase;
}

.result__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
</style>
