import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

import EmptyState from '../EmptyState.vue'
import LoadStatePanel from '../LoadStatePanel.vue'
import OrganizerBreadcrumb from '../OrganizerBreadcrumb.vue'
import OrganizerFooter from '../OrganizerFooter.vue'

const stub = { render: () => null }
const makeRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/manage', name: 'my-championships', component: stub },
      {
        path: '/manage/:championshipId/participants',
        name: 'championship-participants',
        component: stub,
      },
    ],
  })

describe('OrganizerBreadcrumb', () => {
  it('links earlier items and marks the last one as the current page', () => {
    const wrapper = mount(OrganizerBreadcrumb, {
      props: {
        items: [
          { label: 'Meus campeonatos', to: { name: 'my-championships' } },
          { label: 'Copa 2026' },
          {
            label: 'Participantes',
            to: { name: 'championship-participants', params: { championshipId: 'c1' } },
          },
          { label: 'Novo participante', to: { name: 'my-championships' } },
        ],
      },
      global: { plugins: [makeRouter()] },
    })

    expect(wrapper.get('nav').attributes('aria-label')).toBe('Navegação estrutural')
    expect(wrapper.findAll('a').map((a) => [a.text(), a.attributes('href')])).toEqual([
      ['Meus campeonatos', '/manage'],
      ['Participantes', '/manage/c1/participants'],
    ])
    expect(wrapper.get('[aria-current="page"]').text()).toBe('Novo participante')
    expect(wrapper.findAll('li[aria-hidden="true"]')).toHaveLength(3)
  })
})

describe('LoadStatePanel', () => {
  const texts = {
    loadingText: 'Carregando…',
    errorText: 'Falhou.',
    notFoundText: 'Não encontrado.',
    back: { label: 'Voltar', to: '/manage' },
  }

  it('announces loading politely', () => {
    const wrapper = mount(LoadStatePanel, {
      props: { state: 'loading', ...texts },
      global: { plugins: [makeRouter()] },
    })

    expect(wrapper.get('[aria-live="polite"]').text()).toBe('Carregando…')
  })

  it('emits retry from the error alert', async () => {
    const wrapper = mount(LoadStatePanel, {
      props: { state: 'error', ...texts },
      global: { plugins: [makeRouter()] },
    })

    expect(wrapper.get('[role="alert"]').text()).toContain('Falhou.')
    await wrapper.get('[role="alert"] button').trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('offers a way back when not found', () => {
    const wrapper = mount(LoadStatePanel, {
      props: { state: 'not-found', ...texts },
      global: { plugins: [makeRouter()] },
    })

    expect(wrapper.text()).toContain('Não encontrado.')
    expect(wrapper.get('a').text()).toBe('Voltar')
    expect(wrapper.get('a').attributes('href')).toBe('/manage')
  })
})

describe('EmptyState', () => {
  it('renders the title, the text and an optional action', () => {
    const bare = mount(EmptyState, { props: { title: 'Nada aqui.', text: 'Ajuste a busca.' } })
    expect(bare.get('h2').text()).toBe('Nada aqui.')
    expect(bare.text()).toContain('Ajuste a busca.')
    expect(bare.find('button').exists()).toBe(false)

    const withAction = mount(EmptyState, {
      props: { title: 'Nada aqui.', text: 'Ajuste a busca.' },
      slots: { default: '<button type="button">Limpar busca</button>' },
    })
    expect(withAction.get('button').text()).toBe('Limpar busca')
  })
})

describe('OrganizerFooter', () => {
  it('flags demo data when the API is not configured', () => {
    const wrapper = mount(OrganizerFooter)

    expect(wrapper.text()).toContain('CROSSLISEU · UTFPR')
    expect(wrapper.text()).toContain('Conceito visual · dados demonstrativos')
  })
})
