import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import { TOKEN_STORAGE_KEY } from '@/stores/auth'
import { liveToken } from '@/stores/__tests__/token-helpers'
import type { MatchInput } from '@/mocks'
import type { Championship, MatchState, MatchSummary, Robot } from '@/types'
import MatchFormView from '../MatchFormView.vue'
import { MATCH_MESSAGES } from '../match-form'

vi.mock('@/mocks', () => ({
  getChampionship: vi.fn<(id: string) => Promise<Championship | null>>(),
  getRobots: vi.fn<(championshipId: string) => Promise<Robot[]>>(),
  getMatchSummaries: vi.fn<(championshipId: string) => Promise<MatchSummary[]>>(),
  createMatch:
    vi.fn<(championshipId: string, input: MatchInput, token: string) => Promise<MatchSummary>>(),
  updateMatch: vi.fn<(id: string, input: MatchInput, token: string) => Promise<MatchSummary>>(),
  deleteMatch: vi.fn<(id: string, token: string) => Promise<void>>(),
}))
import {
  createMatch,
  deleteMatch,
  getChampionship,
  getMatchSummaries,
  getRobots,
  updateMatch,
} from '@/mocks'

const stub = { render: () => null }
const LEAVE_MESSAGE = 'Há alterações não salvas. Deseja sair mesmo assim?'
const base = { createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' }
const championship: Championship = { ...base, id: 'c1', name: 'Copa 2026', startDate: '2026-12-09' }
const robot = (id: string, name: string, team: string, weightClass: string): Robot => ({
  ...base,
  id,
  championshipId: 'c1',
  name,
  team,
  weightClass,
})
const robots = [
  robot('tita', 'Titã', 'Equipe Volt', 'lightweight'),
  robot('marte', 'Marte', 'Equipe Órbita', 'lightweight'),
  robot('cobalto', 'Cobalto', 'Equipe Órbita', 'lightweight'),
  robot('bigorna', 'Bigorna', 'Equipe Bigorna', 'heavyweight'),
]
const summary = (state: MatchState = 'waiting'): MatchSummary => ({
  ...base,
  id: 'm1',
  championshipId: 'c1',
  weightClass: 'lightweight',
  robotAId: 'tita',
  robotBId: 'marte',
  state,
})

let token = ''
let confirmSpy: ReturnType<typeof vi.spyOn>

async function mountView(path: string) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/manage', name: 'my-championships', component: stub },
      { path: '/manage/:championshipId/matches', name: 'championship-matches', component: stub },
      {
        path: '/manage/:championshipId/participants/new',
        name: 'participant-create',
        component: stub,
      },
      {
        path: '/manage/:championshipId/matches/new',
        name: 'match-create',
        component: MatchFormView,
        props: (route) => ({ mode: 'create', championshipId: route.params.championshipId }),
      },
      {
        path: '/manage/:championshipId/matches/:matchId/edit',
        name: 'match-edit',
        component: MatchFormView,
        props: (route) => ({
          mode: 'edit',
          championshipId: route.params.championshipId,
          matchId: route.params.matchId,
        }),
      },
    ],
  })
  await router.push(path)
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

type Wrapper = Awaited<ReturnType<typeof mountView>>['wrapper']

const comboboxes = (wrapper: Wrapper) => wrapper.findAll('[role="combobox"]')
const options = (wrapper: Wrapper, picker: number) =>
  wrapper.findAll('[role="listbox"]')[picker]!.findAll('[role="option"]')
const optionName = (option: ReturnType<typeof options>[number]) =>
  option.get('.select-field__option-label').text()
const buttonByText = (wrapper: Wrapper, text: string) =>
  wrapper.findAll('button').find((b) => b.text() === text)
const cancelLink = (wrapper: Wrapper) => wrapper.findAll('a').find((a) => a.text() === 'Cancelar')!

async function pick(wrapper: Wrapper, picker: number, name: string) {
  await comboboxes(wrapper)[picker]!.trigger('click')
  await options(wrapper, picker)
    .find((option) => optionName(option) === name)!
    .trigger('click')
}

async function submit(wrapper: Wrapper) {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('MatchFormView', () => {
  beforeEach(() => {
    localStorage.clear()
    token = liveToken()
    vi.mocked(getChampionship).mockReset().mockResolvedValue(championship)
    vi.mocked(getRobots).mockReset().mockResolvedValue(robots)
    vi.mocked(getMatchSummaries).mockReset().mockResolvedValue([summary()])
    vi.mocked(createMatch).mockReset().mockResolvedValue(summary())
    vi.mocked(updateMatch).mockReset().mockResolvedValue(summary())
    vi.mocked(deleteMatch).mockReset().mockResolvedValue(undefined)
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  })
  afterEach(() => {
    confirmSpy.mockRestore()
  })

  it('create: shows two empty pickers, the breadcrumb and Criar luta', async () => {
    const { wrapper } = await mountView('/manage/c1/matches/new')

    expect(wrapper.get('h1').text()).toBe('Nova luta')
    expect(wrapper.findAll('nav li:not([aria-hidden])').map((li) => li.text())).toEqual([
      'Meus campeonatos',
      'Copa 2026',
      'Lutas',
      'Nova luta',
    ])
    expect(comboboxes(wrapper).map((c) => c.text())).toEqual(['Escolha um robô', 'Escolha um robô'])
    expect(wrapper.get('button[type="submit"]').text()).toBe('Criar luta')
    expect(buttonByText(wrapper, 'Excluir luta')).toBeUndefined()
    expect(getMatchSummaries).not.toHaveBeenCalled()
  })

  it("lists only Robô 1's weight class for Robô 2 and disables Robô 1 there", async () => {
    const { wrapper } = await mountView('/manage/c1/matches/new')

    await pick(wrapper, 0, 'Marte')
    await comboboxes(wrapper)[1]!.trigger('click')

    expect(options(wrapper, 1).map(optionName)).toEqual(['Titã', 'Marte', 'Cobalto'])
    const marte = options(wrapper, 1)[1]!
    expect(marte.attributes('aria-disabled')).toBe('true')
    expect(marte.text()).toContain('Já escolhido como Robô 1')
    expect(wrapper.text()).toContain('Participantes · Peso leve')
    expect(wrapper.text()).toContain('Equipe Órbita · Peso leve')
  })

  it('clears Robô 2 when Robô 1 switches to another weight class', async () => {
    const { wrapper } = await mountView('/manage/c1/matches/new')

    await pick(wrapper, 0, 'Marte')
    await pick(wrapper, 1, 'Cobalto')
    await pick(wrapper, 0, 'Bigorna')

    expect(comboboxes(wrapper)[0]!.text()).toBe('Bigorna')
    expect(comboboxes(wrapper)[1]!.text()).toBe('Escolha um robô')
  })

  it('submitting empty shows both required messages and does not save', async () => {
    const { wrapper } = await mountView('/manage/c1/matches/new')

    await submit(wrapper)

    expect(wrapper.text()).toContain(MATCH_MESSAGES.robotARequired)
    expect(wrapper.text()).toContain(MATCH_MESSAGES.robotBRequired)
    expect(createMatch).not.toHaveBeenCalled()
  })

  it('creates the match and returns to the list without confirming', async () => {
    const { wrapper, router } = await mountView('/manage/c1/matches/new')

    await pick(wrapper, 0, 'Marte')
    await pick(wrapper, 1, 'Cobalto')
    await submit(wrapper)

    expect(createMatch).toHaveBeenCalledWith(
      'c1',
      { robotAId: 'marte', robotBId: 'cobalto' },
      token,
    )
    expect(router.currentRoute.value.name).toBe('championship-matches')
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('maps a weight-class mismatch from the API to Robô 2', async () => {
    vi.mocked(createMatch).mockRejectedValue(
      new ApiError(400, 'match_weight_class_mismatch', ['match_weight_class_mismatch']),
    )
    const { wrapper } = await mountView('/manage/c1/matches/new')

    await pick(wrapper, 0, 'Marte')
    await pick(wrapper, 1, 'Cobalto')
    await submit(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toBe(MATCH_MESSAGES.reviewFields)
    expect(comboboxes(wrapper)[1]!.attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain(MATCH_MESSAGES.weightClassMismatch)
  })

  it('updates the preview as robots are picked', async () => {
    const { wrapper } = await mountView('/manage/c1/matches/new')
    const aside = () => wrapper.get('aside').text()

    expect(aside()).toContain('Robô 1')
    expect(aside()).toContain('Programada')

    await pick(wrapper, 0, 'Marte')
    await pick(wrapper, 1, 'Cobalto')

    expect(aside()).toContain('Marte')
    expect(aside()).toContain('Cobalto')
    expect(aside()).toContain('Equipe Órbita × Equipe Órbita · Peso leve')
  })

  it('asks for participants when fewer than two robots exist', async () => {
    vi.mocked(getRobots).mockResolvedValue([robots[0]!])
    const { wrapper } = await mountView('/manage/c1/matches/new')

    expect(wrapper.find('form').exists()).toBe(false)
    const add = wrapper.findAll('a').find((a) => a.text() === 'Adicionar participante')!
    expect(add.attributes('href')).toBe('/manage/c1/participants/new')
  })

  it('edit: pre-fills the robots and saves', async () => {
    const { wrapper, router } = await mountView('/manage/c1/matches/m1/edit')

    expect(wrapper.get('h1').text()).toBe('Editar luta')
    expect(comboboxes(wrapper).map((c) => c.text())).toEqual(['Titã', 'Marte'])
    expect(wrapper.get('button[type="submit"]').text()).toBe('Salvar luta')

    await pick(wrapper, 1, 'Cobalto')
    await submit(wrapper)

    expect(updateMatch).toHaveBeenCalledWith('m1', { robotAId: 'tita', robotBId: 'cobalto' }, token)
    expect(router.currentRoute.value.name).toBe('championship-matches')
  })

  it('edit: explains a match that started since the form loaded', async () => {
    vi.mocked(updateMatch).mockRejectedValue(
      new ApiError(409, 'match_not_editable', ['match_not_editable']),
    )
    const { wrapper } = await mountView('/manage/c1/matches/m1/edit')

    await pick(wrapper, 1, 'Cobalto')
    await submit(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toBe(MATCH_MESSAGES.notEditable)
  })

  it('edit: refuses a match that is no longer scheduled', async () => {
    vi.mocked(getMatchSummaries).mockResolvedValue([summary('running')])
    const { wrapper } = await mountView('/manage/c1/matches/m1/edit')

    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain(MATCH_MESSAGES.notEditable)
    const back = wrapper.findAll('a').find((a) => a.text() === 'Voltar para lutas')!
    expect(back.attributes('href')).toBe('/manage/c1/matches')
  })

  it('edit: shows not found for an unknown match', async () => {
    const { wrapper } = await mountView('/manage/c1/matches/nope/edit')

    expect(wrapper.text()).toContain('Luta não encontrada.')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Escolha dois robôs inscritos neste campeonato.')
  })

  it('shows not found for an unknown championship', async () => {
    vi.mocked(getChampionship).mockResolvedValue(null)
    const { wrapper } = await mountView('/manage/nope/matches/new')

    expect(wrapper.text()).toContain('Campeonato não encontrado.')
    expect(getRobots).not.toHaveBeenCalled()
  })

  it('edit: deletes after confirming, once, and returns to the list', async () => {
    let resolve: () => void = () => {}
    vi.mocked(deleteMatch).mockReturnValue(new Promise<void>((r) => (resolve = r)))
    const { wrapper, router } = await mountView('/manage/c1/matches/m1/edit')

    confirmSpy.mockReturnValueOnce(false)
    await buttonByText(wrapper, 'Excluir luta')!.trigger('click')
    expect(deleteMatch).not.toHaveBeenCalled()

    await buttonByText(wrapper, 'Excluir luta')!.trigger('click')
    await buttonByText(wrapper, 'Excluir luta')!.trigger('click')
    expect(confirmSpy).toHaveBeenCalledWith('Excluir esta luta? Essa ação não pode ser desfeita.')
    expect(deleteMatch).toHaveBeenCalledTimes(1)
    expect(deleteMatch).toHaveBeenCalledWith('m1', token)

    resolve()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('championship-matches')
  })

  it('edit: shows why a delete failed', async () => {
    vi.mocked(deleteMatch).mockRejectedValue(
      new ApiError(409, 'match_not_editable', ['match_not_editable']),
    )
    const { wrapper } = await mountView('/manage/c1/matches/m1/edit')

    await buttonByText(wrapper, 'Excluir luta')!.trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe(MATCH_MESSAGES.notEditable)
  })

  it('asks before leaving with unsaved changes', async () => {
    const { wrapper, router } = await mountView('/manage/c1/matches/new')
    await pick(wrapper, 0, 'Marte')

    confirmSpy.mockReturnValue(false)
    await cancelLink(wrapper).trigger('click')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledWith(LEAVE_MESSAGE)
    expect(router.currentRoute.value.name).toBe('match-create')

    confirmSpy.mockReturnValue(true)
    await cancelLink(wrapper).trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('championship-matches')
  })
})
