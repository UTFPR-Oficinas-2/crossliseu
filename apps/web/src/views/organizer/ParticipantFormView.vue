<script setup lang="ts">
defineProps<{ mode: 'create' | 'edit'; championshipId: string; robotId?: string }>()
</script>

<template>
  <h1 class="text-heading-l">
    {{ mode === 'create' ? 'Adicionar participante' : 'Editar participante' }}
  </h1>
</template>
