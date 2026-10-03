<script setup lang="ts">
// One form for both creating and editing a championship
const { mode } = defineProps<{
  mode: 'create' | 'edit'
  /** Only set in edit mode */
  championshipId?: string
}>()
</script>

<template>
  <h1 class="text-heading-l">
    {{ mode === 'create' ? 'Criar campeonato' : 'Editar campeonato' }}
  </h1>
</template>
