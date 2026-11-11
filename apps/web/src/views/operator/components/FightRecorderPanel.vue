<script setup lang="ts">
// Fight recording on the operator screen (#20). Pick the arena camera, watch the live preview,
// record and stop, then send the file to R2 (presigned URL from the API, PUT straight to R2,
// confirm to the API). The file can also be downloaded to check it.
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import SelectField from '@/components/ui/SelectField.vue'
import type { SelectOption } from '@/components/ui/select-field'
import { useFightRecorder } from '@/composables/useFightRecorder'
import { useRecordingUpload } from '@/composables/useRecordingUpload'
import { useAuthStore } from '@/stores/auth'
import { formatBytes, formatElapsed, recordingFileName } from '@/utils/recording'

const { matchId } = defineProps<{ matchId: string }>()

const {
  cameras,
  cameraId,
  stream,
  state,
  error,
  elapsedSeconds,
  recording,
  mimeType,
  loadCameras,
  retry,
  start,
  stop,
} = useFightRecorder()

const cameraOptions = computed<SelectOption[]>(() =>
  cameras.value.map((camera, index) => ({
    value: camera.deviceId,
    label: camera.label || `Câmera ${index + 1}`,
  })),
)

// <video> needs the live stream as a property (srcObject), not as an attribute
const preview = ref<HTMLVideoElement | null>(null)
watchEffect(() => {
  if (preview.value) preview.value.srcObject = stream.value
})

// Download link for the finished file. The URL points at the Blob in memory, so the old one is
// revoked whenever a new recording replaces it, and when leaving the screen.
const downloadUrl = ref<string | null>(null)
watch(recording, (blob) => {
  if (downloadUrl.value) URL.revokeObjectURL(downloadUrl.value)
  downloadUrl.value = blob ? URL.createObjectURL(blob) : null
  // A new recording replaces the one that was (or was being) sent
  resetUpload()
})
onBeforeUnmount(() => {
  if (downloadUrl.value) URL.revokeObjectURL(downloadUrl.value)
})

const fileName = computed(() => recordingFileName(matchId, mimeType.value))
const isRecording = computed(() => state.value === 'recording')

// ---------- upload to R2 ----------
const auth = useAuthStore()
const {
  state: uploadState,
  progress: uploadProgress,
  error: uploadError,
  upload,
  reset: resetUpload,
} = useRecordingUpload()

const isSending = computed(() =>
  ['requesting', 'uploading', 'completing'].includes(uploadState.value),
)
const uploadPercent = computed(() => Math.round(uploadProgress.value * 100))
const uploadLabel = computed(() => {
  switch (uploadState.value) {
    case 'requesting':
      return 'Preparando o envio…'
    case 'uploading':
      return `Enviando… ${uploadPercent.value}%`
    case 'completing':
      return 'Confirmando com o servidor…'
    case 'done':
      return 'Vídeo enviado.'
    default:
      return ''
  }
})

function send() {
  if (recording.value) void upload(matchId, recording.value, auth.token ?? '')
}

// ---------- don't lose an unsent video ----------
// The video only exists in this tab's memory until it reaches R2
const hasUnsentVideo = computed(
  () => isRecording.value || (recording.value !== null && uploadState.value !== 'done'),
)
const leaveMessage = 'O vídeo da luta ainda não foi enviado e será perdido. Sair mesmo assim?'

// Closing or reloading the tab: the browser shows its own confirmation
function onBeforeUnload(event: BeforeUnloadEvent) {
  if (hasUnsentVideo.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

// Navigating inside the app. Going to another fight's operator route reuses the route, so it is
// guarded too; MatchOperationView keys this panel by match, so the next fight starts empty.
onBeforeRouteLeave(() => !hasUnsentVideo.value || window.confirm(leaveMessage))
onBeforeRouteUpdate(
  (to, from) =>
    to.params.matchId === from.params.matchId ||
    !hasUnsentVideo.value ||
    window.confirm(leaveMessage),
)

function download() {
  if (!downloadUrl.value) return
  const link = document.createElement('a')
  link.href = downloadUrl.value
  link.download = fileName.value
  link.click()
}

onMounted(loadCameras)
</script>

<template>
  <section class="recorder" aria-labelledby="recorder-title">
    <header class="recorder__header">
      <h2 id="recorder-title" class="text-heading-m">Gravação da luta</h2>
      <span
        class="recorder__status text-label-s"
        :class="{ 'recorder__status--live': isRecording }"
        role="status"
      >
        {{
          isRecording
            ? 'Gravando'
            : state === 'stopped'
              ? 'Gravação pronta'
              : state === 'previewing'
                ? 'Câmera pronta'
                : 'Câmera desligada'
        }}
      </span>
    </header>

    <SelectField
      v-model="cameraId"
      label="Câmera da arena"
      :options="cameraOptions"
      placeholder="Nenhuma câmera encontrada"
      :disabled="isRecording || cameraOptions.length === 0"
      hint="A câmera não pode ser trocada durante a gravação."
    />

    <video ref="preview" class="recorder__preview" autoplay muted playsinline />

    <p v-if="error" class="recorder__error text-body-s" role="alert">
      {{ error }}
      <AppButton variant="secondary" @click="retry">Tentar de novo</AppButton>
    </p>

    <div class="recorder__controls">
      <span class="recorder__timer text-timer-l" aria-label="Tempo de gravação">
        {{ formatElapsed(elapsedSeconds) }}
      </span>
      <AppButton v-if="!isRecording" :disabled="!stream || isSending" @click="start">
        {{ state === 'stopped' ? 'Gravar de novo' : 'Gravar' }}
      </AppButton>
      <AppButton v-else variant="destructive" @click="stop">Parar</AppButton>
    </div>

    <div v-if="recording && state === 'stopped'" class="recorder__result">
      <dl class="recorder__facts text-body-s">
        <div>
          <dt>Arquivo</dt>
          <dd class="text-mono-s">{{ fileName }}</dd>
        </div>
        <div>
          <dt>Formato</dt>
          <dd class="text-mono-s">{{ mimeType || recording.type }}</dd>
        </div>
        <div>
          <dt>Tamanho</dt>
          <dd class="text-mono-s">{{ formatBytes(recording.size) }}</dd>
        </div>
        <div>
          <dt>Duração</dt>
          <dd class="text-mono-s">{{ formatElapsed(elapsedSeconds) }}</dd>
        </div>
      </dl>
      <div class="recorder__actions">
        <AppButton variant="secondary" @click="download">Baixar</AppButton>
        <AppButton v-if="uploadState === 'idle'" @click="send">Enviar</AppButton>
        <AppButton v-else-if="uploadState === 'error'" @click="send">Tentar de novo</AppButton>
      </div>

      <div v-if="uploadState !== 'idle'" class="recorder__upload" aria-live="polite">
        <progress
          v-if="isSending"
          class="recorder__progress"
          :value="uploadState === 'uploading' ? uploadProgress : undefined"
          max="1"
          aria-label="Progresso do envio"
        />
        <p
          v-if="uploadLabel"
          class="text-body-s"
          :class="{ 'recorder__upload-done': uploadState === 'done' }"
        >
          {{ uploadLabel }}
        </p>
        <p v-if="uploadError" class="recorder__error text-body-s" role="alert">
          {{ uploadError }}
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.recorder {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 720px;
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.recorder__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.recorder__status {
  color: var(--color-muted);
}

/* Live, like a fight in progress (`Status / Pill` Accent); red is only for errors */
.recorder__status--live {
  color: var(--color-orange);
}

.recorder__preview {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  object-fit: contain;
}

.recorder__error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-red);
}

.recorder__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.recorder__timer {
  color: var(--color-text);
}

.recorder__result {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-soft);
}

.recorder__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, auto));
  gap: var(--space-2) var(--space-6);
  margin: 0;
}

.recorder__facts dt {
  color: var(--color-muted);
}

.recorder__facts dd {
  margin: 0;
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.recorder__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.recorder__upload {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
}

/* Native <progress>: no value = indeterminate (requesting, completing) */
.recorder__progress {
  width: 100%;
  height: var(--space-2);
  accent-color: var(--color-orange);
}

.recorder__upload-done {
  color: var(--color-green);
}
</style>
