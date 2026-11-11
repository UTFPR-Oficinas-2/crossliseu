<script setup lang="ts">
// Figma: `Camera / Preview` (node 247:42). Live camera feed for the operator screens (#20). The
// preview plays the same getUserMedia stream that is being recorded. `recording` shows the
// orange GRAVANDO pill with the recording time; it never uses red. With no stream yet, the
// arena outline from Figma fills the stage.
import { ref, watchEffect } from 'vue'
import arenaOutline from '@/assets/arena-outline.png'
import StatusPill from './StatusPill.vue'

const {
  stream = null,
  caption = 'Pré-visualização ao vivo',
  signal = '',
  recording = false,
  elapsed = '',
} = defineProps<{
  /** Live camera feed; null shows the arena outline */
  stream?: MediaStream | null
  caption?: string
  /** Technical line under the stage, e.g. "1280 × 720 · 30 fps" */
  signal?: string
  recording?: boolean
  /** Recording time, e.g. "01:18"; shown only while recording */
  elapsed?: string
}>()

// <video> needs the live stream as a property (srcObject), not as an attribute
const video = ref<HTMLVideoElement | null>(null)
watchEffect(() => {
  if (video.value) video.value.srcObject = stream
})
</script>

<template>
  <figure class="camera-preview">
    <header class="camera-preview__header">
      <figcaption class="camera-preview__caption text-overline">{{ caption }}</figcaption>
      <div v-if="recording" class="camera-preview__recording">
        <StatusPill label="Gravando" tone="accent" />
        <span
          v-if="elapsed"
          class="camera-preview__elapsed text-mono-m"
          aria-label="Tempo de gravação"
        >
          {{ elapsed }}
        </span>
      </div>
    </header>

    <div class="camera-preview__stage">
      <video
        v-show="stream"
        ref="video"
        class="camera-preview__video"
        autoplay
        muted
        playsinline
        aria-label="Imagem ao vivo da câmera da arena"
      />
      <img v-if="!stream" :src="arenaOutline" alt="" width="112" height="112" />
    </div>

    <p v-if="signal" class="camera-preview__signal text-mono-s">{{ signal }}</p>
  </figure>
</template>

<style scoped>
.camera-preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  aspect-ratio: 380 / 214;
  margin: 0;
  padding: var(--space-5);
  overflow: hidden;
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
}

.camera-preview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.camera-preview__caption {
  flex: 1;
  min-width: 0;
  color: var(--color-muted);
}

.camera-preview__recording {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--space-10px);
}

.camera-preview__elapsed {
  color: var(--color-orange);
  white-space: nowrap;
}

.camera-preview__stage {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
  overflow: hidden;
}

.camera-preview__video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.camera-preview__signal {
  margin: 0;
  color: var(--color-green);
}
</style>
