<script setup lang="ts">
import { isApiEnabled } from '@/api/client'
</script>

<template>
  <footer class="organizer-footer text-mono-s">
    <p>CROSSLISEU · UTFPR</p>
    <p v-if="!isApiEnabled">Conceito visual · dados demonstrativos</p>
  </footer>
</template>

<style scoped>
.organizer-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-2);
  padding-top: var(--space-2);
  color: var(--color-muted);
}
</style>
