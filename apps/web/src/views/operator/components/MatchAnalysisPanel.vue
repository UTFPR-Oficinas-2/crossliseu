<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import type { StatusTone } from '@/components/ui/status-pill'
import { useMatchAnalysis } from '@/composables/useMatchAnalysis'
import { useAuthStore } from '@/stores/auth'
import type { ProcessingStatus, Side } from '@/types'

/**
 * The CV worker's analysis of the uploaded fight video (#21): its status while it runs, then one
 * heatmap per robot. `uploads` goes up each time the recorder confirms an upload, which starts a
 * new read (the API has just queued the job).
 */
const { matchId, robots, uploads } = defineProps<{
  matchId: string
  robots: Record<Side, string>
  uploads: number
}>()

const auth = useAuthStore()
const { analysis, loadState, inProgress, refresh } = useMatchAnalysis(
  () => matchId,
  () => auth.token ?? '',
)

onMounted(refresh)
watch(
  () => uploads,
  () => void refresh(),
)

const display: Record<ProcessingStatus, { label: string; tone: StatusTone }> = {
  pending: { label: 'Na fila', tone: 'warning' },
  processing: { label: 'Processando', tone: 'accent' },
  completed: { label: 'Concluída', tone: 'success' },
  failed: { label: 'Falhou', tone: 'danger' },
}

/** Codes from the API (queue_unavailable) and the CV worker (apps/cv-worker/src/jobs.py) */
const errorMessages: Record<string, string> = {
  queue_unavailable: 'O serviço de análise não estava disponível quando o vídeo foi enviado.',
  recording_not_found: 'O vídeo não foi encontrado no armazenamento.',
  video_unreadable: 'O vídeo não pôde ser lido.',
  invalid_message: 'O pedido de análise chegou inválido ao serviço de análise.',
}

const pill = computed(() =>
  analysis.value
    ? display[analysis.value.status]
    : { label: 'Sem vídeo', tone: 'neutral' as const },
)
const errorText = computed(() => {
  const code = analysis.value?.error
  return (code && errorMessages[code]) ?? 'Ocorreu um erro ao processar o vídeo.'
})

function caption(detected: number | null) {
  const total = analysis.value?.totalFrames
  if (detected === null) return 'Posições não disponíveis'
  return total ? `Encontrado em ${detected} de ${total} quadros` : `${detected} posições`
}

// The image URLs are signed for a few minutes: a page left open asks for fresh ones when they
// stop loading. Only once per set of URLs, so a link that is broken for another reason can't loop.
let reloadedFor: string | null = null
function onImageError() {
  const urls = analysis.value?.heatmaps.map((heatmap) => heatmap.imageUrl).join(' ') ?? ''
  if (urls === reloadedFor) return
  reloadedFor = urls
  void refresh()
}
</script>

<template>
  <section class="analysis" aria-labelledby="analysis-title">
    <header class="analysis__header">
      <h2 id="analysis-title" class="text-heading-m">Análise da luta</h2>
      <StatusPill v-if="loadState !== 'loading'" :label="pill.label" :tone="pill.tone" />
    </header>

    <p v-if="loadState === 'loading'" class="analysis__note text-body-s" role="status">
      Carregando a análise…
    </p>

    <div v-else-if="loadState === 'error' && !analysis" class="analysis__error">
      <p class="text-body-m" role="alert">Não foi possível carregar a análise.</p>
      <AppButton variant="secondary" @click="refresh">Tentar de novo</AppButton>
    </div>

    <p v-else-if="!analysis" class="analysis__note text-body-s">
      A análise começa quando o vídeo da luta é enviado.
    </p>

    <template v-else>
      <div v-if="loadState === 'error'" class="analysis__stale">
        <p class="text-body-s" role="alert">
          {{
            inProgress
              ? 'Sem resposta do servidor. Tentando de novo…'
              : 'Não foi possível atualizar a análise.'
          }}
        </p>
        <AppButton v-if="!inProgress" variant="secondary" @click="refresh"
          >Tentar de novo</AppButton
        >
      </div>

      <p
        v-if="analysis.status === 'pending' || analysis.status === 'processing'"
        class="analysis__note text-body-s"
        role="status"
      >
        {{
          analysis.status === 'pending'
            ? 'O vídeo está na fila para ser analisado.'
            : 'Processando o vídeo: identificando os robôs e montando os mapas de calor.'
        }}
      </p>

      <p v-else-if="analysis.status === 'failed'" class="analysis__failed text-body-m" role="alert">
        {{ errorText }}
      </p>

      <template v-else>
        <p v-if="analysis.mock" class="analysis__mock text-body-s">
          Modo de teste: estes mapas vêm do vídeo de teste do servidor, não desta gravação.
        </p>
        <div class="analysis__heatmaps">
          <figure
            v-for="heatmap in analysis.heatmaps"
            :key="heatmap.side"
            class="analysis__heatmap"
            :class="`analysis__heatmap--${heatmap.side.toLowerCase()}`"
          >
            <img
              v-if="heatmap.imageUrl"
              :src="heatmap.imageUrl"
              :alt="`Mapa de calor do lado ${heatmap.side}, ${robots[heatmap.side]}`"
              @error="onImageError"
            />
            <p v-else class="analysis__note text-body-s">Sem mapa de calor para este robô.</p>
            <figcaption>
              <span class="text-overline"
                >Lado {{ heatmap.side }} · {{ robots[heatmap.side] }}</span
              >
              <span class="analysis__note text-body-s">{{
                caption(heatmap.detectedPositions)
              }}</span>
            </figcaption>
          </figure>
        </div>
      </template>
    </template>
  </section>
</template>

<style scoped>
.analysis {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.analysis__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.analysis__note {
  color: var(--color-muted);
}

.analysis__error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
}

.analysis__stale {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.analysis__error [role='alert'],
.analysis__stale [role='alert'],
.analysis__failed {
  color: var(--color-red);
}

.analysis__mock {
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-muted);
}

.analysis__heatmaps {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.analysis__heatmap {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: var(--space-3);
  border: 1px solid;
  border-radius: var(--radius-sm);
  background: var(--color-raised);
}

.analysis__heatmap--a {
  border-color: var(--color-blue);
}

.analysis__heatmap--b {
  border-color: var(--color-pink);
}

.analysis__heatmap img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius-sm);
}

.analysis__heatmap figcaption {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

@media (max-width: 767px) {
  .analysis__heatmaps {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
