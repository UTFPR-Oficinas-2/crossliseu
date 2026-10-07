import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import { TOKEN_STORAGE_KEY } from '@/stores/auth'
import { liveToken } from '@/stores/__tests__/token-helpers'
import type { Championship, Robot } from '@/types'
import ParticipantsView from '../ParticipantsView.vue'

vi.mock('@/mocks', () => ({
  getChampionship: vi.fn<(id: string) => Promise<Championship | null>>(),
  getRobots: vi.fn<(championshipId: string) => Promise<Robot[]>>(),
  deleteRobot: vi.fn<(id: string, token: string) => Promise<void>>(),
}))
import { deleteRobot, getChampionship, getRobots } from '@/mocks'

const stub = { render: () => null }
const base = { createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' }
const championship: Championship = { ...base, id: 'c1', name: 'Copa 2026', startDate: '2026-12-09' }
const robot = (id: string, name: string, team: string, weightClass = 'lightweight'): Robot => ({
  ...base,
  id,
  championshipId: 'c1',
  name,
  team,
  weightClass,
})
const fixture = () => [
  robot('r1', 'Titã', 'Equipe Volt'),
  robot('r2', 'Aço', 'Equipe Aço'),
  robot('r3', 'Marte', 'Equipe Volt', 'heavyweight'),
]

let token = ''
let confirmSpy: ReturnType<typeof vi.spyOn>

async function mountView(path = '/manage/c1/participants') {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/manage', name: 'my-championships', component: stub },
      {
        path: '/manage/:championshipId/participants',
        name: 'championship-participants',
        component: ParticipantsView,
        props: true,
      },
      {
        path: '/manage/:championshipId/participants/new',
        name: 'participant-create',
        component: stub,
      },
      {
        path: '/manage/:championshipId/participants/:robotId/edit',
        name: 'participant-edit',
        component: stub,
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

const rowNames = (wrapper: Wrapper) => wrapper.findAll('tbody th').map((th) => th.text())
const removeButton = (wrapper: Wrapper, name: string) =>
  wrapper.findAll('button').find((b) => b.attributes('aria-label') === `Remover ${name}`)!

describe('ParticipantsView', () => {
  beforeEach(() => {
    localStorage.clear()
    token = liveToken()
    vi.mocked(getChampionship).mockReset().mockResolvedValue(championship)
    vi.mocked(getRobots).mockReset().mockResolvedValue(fixture())
    vi.mocked(deleteRobot).mockReset().mockResolvedValue(undefined)
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  })
  afterEach(() => {
    confirmSpy.mockRestore()
  })

  it('lists robots with team and weight class and counts robots and teams', async () => {
    const { wrapper } = await mountView()

    expect(rowNames(wrapper)).toEqual(['Titã', 'Aço', 'Marte'])
    const marte = wrapper.findAll('tbody tr')[2]!
    expect(marte.text()).toContain('Equipe Volt')
    expect(marte.text()).toContain('Peso pesado')
    expect(wrapper.text()).toContain('3 robôs inscritos · 2 equipes')
    expect(wrapper.findAll('nav li:not([aria-hidden])').map((li) => li.text())).toEqual([
      'Meus campeonatos',
      'Copa 2026',
      'Participantes',
    ])
  })

  it('keeps explicit table roles so the reflowing rows stay a table for assistive tech', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.get('table').attributes('role')).toBe('table')
    expect(wrapper.findAll('[role="columnheader"]').map((th) => th.text())).toEqual([
      'Robô',
      'Equipe',
      'Categoria',
      'Ações',
    ])
    const rows = wrapper.findAll('tbody tr')
    expect(rows.map((tr) => tr.attributes('role'))).toEqual(['row', 'row', 'row'])
    expect(rows.map((tr) => tr.get('[role="rowheader"]').text())).toEqual(['Titã', 'Aço', 'Marte'])
    const cells = rows[0]!.findAll('[role="cell"]')
    expect(cells).toHaveLength(3)
    expect(cells.slice(0, 2).map((td) => td.text())).toEqual(['Equipe Volt', 'Peso leve'])
    expect(cells[2]!.findAll('a, button').map((el) => el.attributes('aria-label'))).toEqual([
      'Editar Titã',
      'Remover Titã',
    ])
  })

  it('links to the create and edit forms', async () => {
    const { wrapper } = await mountView()
    const links = wrapper.findAll('a')

    expect(links.find((a) => a.text() === 'Adicionar participante')!.attributes('href')).toBe(
      '/manage/c1/participants/new',
    )
    expect(
      links.find((a) => a.attributes('aria-label') === 'Editar Titã')!.attributes('href'),
    ).toBe('/manage/c1/participants/r1/edit')
  })

  it('filters by robot or team and clears the search', async () => {
    const { wrapper } = await mountView()
    const search = wrapper.get<HTMLInputElement>('input[type="search"]')

    await search.setValue('aco')
    expect(rowNames(wrapper)).toEqual(['Aço'])

    await search.setValue('volt')
    expect(rowNames(wrapper)).toEqual(['Titã', 'Marte'])

    await search.setValue('zzz')
    expect(wrapper.text()).toContain('Nenhum participante corresponde a essa busca.')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Limpar busca')!
      .trigger('click')
    expect(search.element.value).toBe('')
    expect(rowNames(wrapper)).toHaveLength(3)
  })

  it('labels the search field for screen readers only', async () => {
    const { wrapper } = await mountView()
    const label = wrapper.get('label')

    expect(label.text()).toBe('Buscar participantes')
    expect(label.classes()).toContain('visually-hidden')
    expect(wrapper.get('input[type="search"]').attributes('placeholder')).toBe(
      'Buscar robô ou equipe',
    )
  })

  it('shows an empty state without robots', async () => {
    vi.mocked(getRobots).mockResolvedValue([])
    const { wrapper } = await mountView()

    expect(wrapper.text()).toContain('Nenhum participante inscrito.')
    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.find('input[type="search"]').exists()).toBe(false)
  })

  it('removes a robot only after confirming', async () => {
    const { wrapper } = await mountView()

    confirmSpy.mockReturnValueOnce(false)
    await removeButton(wrapper, 'Aço').trigger('click')
    expect(deleteRobot).not.toHaveBeenCalled()

    await removeButton(wrapper, 'Aço').trigger('click')
    await flushPromises()
    expect(confirmSpy).toHaveBeenLastCalledWith(
      'Remover Aço do campeonato? Essa ação não pode ser desfeita.',
    )
    expect(deleteRobot).toHaveBeenCalledWith('r2', token)
    expect(rowNames(wrapper)).toEqual(['Titã', 'Marte'])
  })

  it('sends one request when Remover is clicked twice', async () => {
    let resolve: () => void = () => {}
    vi.mocked(deleteRobot).mockReturnValue(new Promise<void>((r) => (resolve = r)))
    const { wrapper } = await mountView()

    await removeButton(wrapper, 'Aço').trigger('click')
    await removeButton(wrapper, 'Titã').trigger('click')

    expect(deleteRobot).toHaveBeenCalledTimes(1)
    resolve()
    await flushPromises()
  })

  it('keeps the row and explains when the robot is in a match', async () => {
    vi.mocked(deleteRobot).mockRejectedValue(
      new ApiError(409, 'robot_has_matches', ['robot_has_matches']),
    )
    const { wrapper } = await mountView()

    await removeButton(wrapper, 'Titã').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Não foi possível remover Titã: o robô está em lutas do campeonato.',
    )
    expect(rowNames(wrapper)).toContain('Titã')
  })

  it('drops a robot that was already removed elsewhere', async () => {
    vi.mocked(deleteRobot).mockRejectedValue(
      new ApiError(404, 'robot_not_found', ['robot_not_found']),
    )
    const { wrapper } = await mountView()

    await removeButton(wrapper, 'Titã').trigger('click')
    await flushPromises()

    expect(rowNames(wrapper)).toEqual(['Aço', 'Marte'])
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('drops the previous name and search when the championship changes', async () => {
    const { wrapper, router } = await mountView()
    await wrapper.get<HTMLInputElement>('input[type="search"]').setValue('aco')

    let resolve: (value: Championship) => void = () => {}
    vi.mocked(getChampionship).mockReturnValueOnce(new Promise((r) => (resolve = r)))
    await router.push('/manage/c2/participants')
    await flushPromises()

    expect(wrapper.findAll('nav li:not([aria-hidden])').map((li) => li.text())).toEqual([
      'Meus campeonatos',
      'Participantes',
    ])

    resolve({ ...championship, id: 'c2', name: 'Copa 2027' })
    await flushPromises()
    expect(wrapper.text()).toContain('Copa 2027')
    expect(wrapper.text()).not.toContain('Copa 2026')
    expect(wrapper.get<HTMLInputElement>('input[type="search"]').element.value).toBe('')
    expect(rowNames(wrapper)).toHaveLength(3)
  })

  it('shows not found for an unknown championship without listing robots', async () => {
    vi.mocked(getChampionship).mockResolvedValue(null)
    const { wrapper } = await mountView('/manage/nope/participants')

    expect(wrapper.text()).toContain('Campeonato não encontrado.')
    expect(getRobots).not.toHaveBeenCalled()
  })

  it('shows a retry panel when loading fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getRobots).mockRejectedValueOnce(new Error('boom'))
    const { wrapper } = await mountView()

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Não foi possível carregar os participantes.',
    )
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()

    expect(rowNames(wrapper)).toHaveLength(3)
    error.mockRestore()
  })
})
