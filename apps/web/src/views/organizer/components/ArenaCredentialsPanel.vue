<script setup lang="ts">
// Figma ORG-22: the arena's config.h, shown once. The text lives only in the parent's local state.
import { ref } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import { ARENA_CONFIG_FILENAME } from '@/utils/arena-config'

const { arenaName, config } = defineProps<{ arenaName: string; config: string }>()

const copied = ref(false)
const copyFailed = ref(false)

function download() {
  const url = URL.createObjectURL(new Blob([config], { type: 'text/x-chdr' }))
  const link = document.createElement('a')
  link.href = url
  link.download = ARENA_CONFIG_FILENAME
  link.click()
  URL.revokeObjectURL(url)
}

async function copy() {
  copied.value = false
  copyFailed.value = false
  try {
    await navigator.clipboard.writeText(config)
    copied.value = true
  } catch {
    copyFailed.value = true
  }
}
</script>

<template>
  <section class="credentials" aria-labelledby="credentials-title">
    <h2 id="credentials-title" class="credentials__title text-heading-m">
      Configuração da arena {{ arenaName }}
    </h2>
    <p class="credentials__warning text-body-m" role="status">
      Copie agora: este arquivo não será mostrado novamente. Gerar um novo token faz a caixa antiga
      parar de conectar.
    </p>
    <pre class="credentials__code text-mono-s">{{ config }}</pre>
    <div class="credentials__actions">
      <AppButton @click="download">Baixar {{ ARENA_CONFIG_FILENAME }}</AppButton>
      <AppButton variant="secondary" @click="copy">Copiar</AppButton>
      <span v-if="copied" class="credentials__feedback text-body-s" aria-live="polite">
        Copiado.
      </span>
      <span v-if="copyFailed" class="credentials__feedback text-body-s" role="alert">
        Não foi possível copiar. Selecione o texto e copie manualmente.
      </span>
    </div>
  </section>
</template>

<style scoped>
.credentials {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
  border: 1px solid var(--color-orange);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.credentials__title {
  color: var(--color-text);
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

.credentials__warning {
  color: var(--color-text);
}

.credentials__code {
  margin: 0;
  padding: var(--space-4);
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  user-select: all;
}

.credentials__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.credentials__feedback {
  color: var(--color-muted);
}
</style>
