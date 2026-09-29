<script setup lang="ts">
import FightRow from '@/features/matches/components/FightRow.vue'
</script>

<template>
  <div>
    <h1>Lutas</h1>
    <ol class="fight-list">
      <li>
        <FightRow :fight-number="1" robot-a="Claudio" robot-b="Gepeto" status="running">
          <button type="button">Ver bang</button>
        </FightRow>
      </li>
      <li>
        <FightRow :fight-number="2" robot-a="Ses" robot-b="Braz" status="cancelled">
          <button type="button">Ver bang</button>
        </FightRow>
      </li>
    </ol>
  </div>
</template>
