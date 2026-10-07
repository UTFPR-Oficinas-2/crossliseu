<script setup lang="ts">
defineProps<{ mode: 'create' | 'edit'; championshipId: string; matchId?: string }>()
</script>

<template>
  <h1 class="text-heading-l">{{ mode === 'create' ? 'Nova luta' : 'Editar luta' }}</h1>
</template>
