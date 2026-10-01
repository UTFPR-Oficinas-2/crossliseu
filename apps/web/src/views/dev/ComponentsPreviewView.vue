<script setup lang="ts">
import { ref } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppNav from '@/components/ui/AppNav.vue'
import ChampionshipCard from '@/components/ui/ChampionshipCard.vue'
import CompetitorTile from '@/components/ui/CompetitorTile.vue'
import FightRow from '@/components/ui/FightRow.vue'
import InputField from '@/components/ui/InputField.vue'
import OperatorNav from '@/components/ui/OperatorNav.vue'
import OverviewMetric from '@/components/ui/OverviewMetric.vue'
import PublicNav from '@/components/ui/PublicNav.vue'
import SidebarItem from '@/components/ui/SidebarItem.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import TabItem from '@/components/ui/TabItem.vue'

const buttonVariants = [
  { variant: 'primary', label: 'Criar campeonato' },
  { variant: 'secondary', label: 'Editar' },
  { variant: 'ghost', label: 'Cancelar' },
  { variant: 'destructive', label: 'Excluir' },
] as const

const statusPills = [
  { tone: 'live', label: 'Em andamento' },
  { tone: 'neutral', label: 'Aguardando' },
  { tone: 'success', label: 'Encerrada' },
  { tone: 'warning', label: 'Pausada' },
  { tone: 'danger', label: 'Falhou' },
] as const

const tabs = ['Visão geral', 'Participantes', 'Lutas']
const activeTab = ref(tabs[0])

const sidebarItems = ['Visão geral', 'Participantes', 'Lutas']
const activeSidebarItem = ref(sidebarItems[0])

const championshipName = ref('Crossliseu 2026')
const emptyName = ref('')
const invalidEmail = ref('arbitro@')
const disabledCode = ref('ARB-4821')

const championships = [
  {
    name: 'Crossliseu 2026 · Etapa Curitiba',
    edition: 3,
    date: '2026-10-17',
    status: 'running',
    robotCount: 16,
    fightsDone: 6,
    fightsTotal: 15,
  },
  {
    name: 'Copa UTFPR de Robôs de Combate',
    edition: 1,
    date: '2026-12-09',
    status: 'scheduled',
    robotCount: 8,
    fightsDone: 0,
    fightsTotal: 7,
  },
  {
    name: 'Crossliseu 2026 · Etapa Ponta Grossa',
    edition: 2,
    date: '2026-06-21',
    status: 'finished',
    robotCount: 12,
    fightsDone: 11,
    fightsTotal: 11,
  },
] as const

const fights = [
  { fightNumber: 1, robotA: 'Claudio', robotB: 'Gepeto', status: 'done' },
  { fightNumber: 2, robotA: 'Ses', robotB: 'Braz', status: 'running' },
  { fightNumber: 3, robotA: 'Faísca', robotB: 'Trovão', status: 'paused' },
  { fightNumber: 4, robotA: 'Martelinho', robotB: 'Destruidor Supremo II', status: 'waiting' },
  { fightNumber: 5, robotA: 'Volt', robotB: 'Ferrugem', status: 'cancelled' },
] as const

const operatorExits = ref(0)
</script>

<template>
  <div class="preview">
    <header class="preview__header">
      <p class="text-overline preview__kicker">Dev</p>
      <h1 class="text-display-page">Componentes</h1>
      <p class="text-body-m preview__sub">
        Catálogo vivo dos componentes de `src/components/ui/` com suas variantes.
      </p>
    </header>

    <section class="preview__section">
      <h2 class="text-heading-m">Tipografia</h2>
      <div class="preview__swatches">
        <p class="text-display-page">Display / Page</p>
        <p class="text-heading-l">Heading / L</p>
        <p class="text-heading-m">Heading / M</p>
        <p class="text-heading-s">Heading / S</p>
        <p class="text-numeric-l">Numeric / L 1.234</p>
        <p class="text-body-m">Body / M</p>
        <p class="text-body-s">Body / S</p>
        <p class="text-label-m">Label / M</p>
        <p class="text-label-s">Label / S</p>
        <p class="text-overline">Overline</p>
        <p class="text-mono-m">Mono / M</p>
        <p class="text-mono-s">Mono / S</p>
      </div>
    </section>

    <section class="preview__section">
      <h2 class="text-heading-m">Cores</h2>
      <div class="preview__colors">
        <div
          v-for="color in [
            'bg',
            'panel',
            'raised',
            'border',
            'border-soft',
            'text',
            'muted',
            'orange',
            'orange-dim',
            'green',
            'blue',
            'pink',
            'red',
            'red-dim',
            'amber',
          ]"
          :key="color"
          class="preview__color"
        >
          <span class="preview__swatch" :style="{ background: `var(--color-${color})` }" />
          <span class="text-mono-s">--color-{{ color }}</span>
        </div>
      </div>
    </section>

    <section class="preview__section">
      <h2 class="text-heading-m">Button</h2>
      <p class="text-overline preview__label">Habilitado</p>
      <div class="preview__row">
        <AppButton v-for="b in buttonVariants" :key="b.variant" :variant="b.variant">
          {{ b.label }}
        </AppButton>
      </div>
      <p class="text-overline preview__label">Desabilitado</p>
      <div class="preview__row">
        <AppButton v-for="b in buttonVariants" :key="b.variant" :variant="b.variant" disabled>
          {{ b.label }}
        </AppButton>
      </div>
      <p class="text-overline preview__label">Rótulo longo (largura mínima / crescimento)</p>
      <div class="preview__row">
        <AppButton>OK</AppButton>
        <AppButton variant="secondary">Convidar árbitros para a sessão</AppButton>
      </div>
    </section>

    <section class="preview__section">
      <h2 class="text-heading-m">Status / Pill</h2>
      <div class="preview__row">
        <StatusPill v-for="p in statusPills" :key="p.tone" :label="p.label" :tone="p.tone" />
      </div>
    </section>

    <section class="preview__section">
      <h2 class="text-heading-m">Tab / Item</h2>
      <p class="text-overline preview__label">Estático: Ativo · Inativo</p>
      <div class="preview__row">
        <TabItem active label="Ativo" />
        <TabItem label="Inativo" />
      </div>
      <p class="text-overline preview__label">Interativo</p>
      <div class="preview__row" role="tablist" aria-label="Exemplo de abas">
        <TabItem
          v-for="tab in tabs"
          :key="tab"
          :label="tab"
          :active="tab === activeTab"
          @click="activeTab = tab"
        />
      </div>
    </section>

    <section class="preview__section">
      <h2 class="text-heading-m">Sidebar / Item</h2>
      <nav class="preview__sidebar" aria-label="Exemplo de menu lateral">
        <SidebarItem
          v-for="item in sidebarItems"
          :key="item"
          :to="{ name: 'dev-componentes' }"
          :active="item === activeSidebarItem"
          @click="activeSidebarItem = item"
        >
          {{ item }}
        </SidebarItem>
      </nav>
    </section>

    <section class="preview__section">
      <h2 class="text-heading-m">Input / Field</h2>
      <div class="preview__fields">
        <InputField
          v-model="championshipName"
          label="Nome do campeonato"
          hint="Aparece na página pública do campeonato."
        />
        <InputField
          v-model="emptyName"
          label="Vazio com placeholder"
          placeholder="Ex.: Equipe Volt"
        />
        <InputField
          v-model="invalidEmail"
          label="E-mail"
          type="email"
          hint="Este texto some quando há erro."
          error="Informe um e-mail válido."
        />
        <InputField v-model="disabledCode" label="Código de acesso" disabled />
      </div>
    </section>

    <section class="preview__section">
      <h2 class="text-heading-m">Competitor / Tile</h2>
      <div class="preview__tiles">
        <CompetitorTile side="A" team="Equipe Volt" robot="Claudio" details="Peso 3 kg · Arrasto" />
        <CompetitorTile
          side="B"
          team="Equipe Faísca"
          robot="Gepeto"
          details="Peso 3 kg · Martelo"
        />
        <CompetitorTile side="A" team="Equipe Sem Detalhes" robot="Ses" />
        <CompetitorTile side="B" team="Nome muito longo de equipe" robot="Destruidor Supremo II" />
      </div>
    </section>

    <section class="preview__section">
      <h2 class="text-heading-m">Metric / Overview</h2>
      <div class="preview__metrics">
        <OverviewMetric :value="16" label="Robôs inscritos" />
        <OverviewMetric :value="1234" label="Número com milhar (pt-BR)" />
        <OverviewMetric value="3/8" label="Valor em texto" />
      </div>
    </section>

    <section class="preview__section">
      <h2 class="text-heading-m">Row / Fight</h2>
      <div class="preview__fights">
        <FightRow v-for="fight in fights" :key="fight.fightNumber" v-bind="fight">
          <AppButton variant="secondary" :to="{ name: 'dev-componentes' }">Detalhes</AppButton>
        </FightRow>
        <FightRow :fight-number="6" robot-a="Sem ações" robot-b="Slot vazio" status="waiting" />
      </div>
    </section>

    <section class="preview__section">
      <h2 class="text-heading-m">Card / Championship</h2>
      <div class="preview__cards">
        <ChampionshipCard
          v-for="championship in championships"
          :key="championship.name"
          v-bind="championship"
          :to="{ name: 'dev-componentes' }"
        />
      </div>
    </section>

    <section class="preview__section">
      <h2 class="text-heading-m">Navigation / Public</h2>
      <div class="preview__nav">
        <PublicNav />
      </div>
    </section>

    <section class="preview__section">
      <h2 class="text-heading-m">Navigation / App</h2>
      <div class="preview__nav">
        <AppNav user-name="E. Vidias" active="my-championships" />
      </div>
    </section>

    <section class="preview__section">
      <h2 class="text-heading-m">Navigation / Operator</h2>
      <div class="preview__nav">
        <OperatorNav
          championship="Crossliseu 2026 · Etapa Curitiba"
          :fight-number="8"
          arena="ARENA 01"
          @exit="operatorExits++"
        />
      </div>
      <p class="text-body-s preview__label">
        "Sair da operação" clicado {{ operatorExits }} vez(es)
      </p>
    </section>
  </div>
</template>

<style scoped>
.preview {
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-7) var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}

.preview__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.preview__kicker,
.preview__sub,
.preview__label {
  color: var(--color-muted);
}

.preview__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.preview__swatches {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.preview__colors {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-4);
}

.preview__color {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.preview__swatch {
  display: inline-block;
  width: var(--space-6);
  height: var(--space-6);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.preview__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.preview__sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  max-width: 240px;
  padding: var(--space-3);
  background: var(--color-panel);
}

.preview__fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-6);
}

.preview__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-4);
}

.preview__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-4);
}

.preview__fights {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.preview__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--space-4);
}

.preview__nav {
  border: 1px dashed var(--color-border);
}
</style>
