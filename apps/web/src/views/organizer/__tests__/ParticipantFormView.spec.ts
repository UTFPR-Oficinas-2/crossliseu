import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import { TOKEN_STORAGE_KEY } from '@/stores/auth'
import { liveToken } from '@/stores/__tests__/token-helpers'
import type { RobotInput } from '@/mocks'
import type { Championship, Robot } from '@/types'
import ParticipantFormView from '../ParticipantFormView.vue'
import { PARTICIPANT_MESSAGES } from '../participant-form'

vi.mock('@/mocks', () => ({
  getChampionship: vi.fn<(id: string) => Promise<Championship | null>>(),
  getRobots: vi.fn<(championshipId: string) => Promise<Robot[]>>(),
  createRobot:
    vi.fn<(championshipId: string, input: RobotInput, token: string) => Promise<Robot>>(),
  updateRobot: vi.fn<(id: string, input: RobotInput, token: string) => Promise<Robot>>(),
}))
import { createRobot, getChampionship, getRobots, updateRobot } from '@/mocks'

const stub = { render: () => null }
const LEAVE_MESSAGE = 'Há alterações não salvas. Deseja sair mesmo assim?'
const base = { createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' }
const championship: Championship = { ...base, id: 'c1', name: 'Copa 2026', startDate: '2026-12-09' }
const tita: Robot = {
  ...base,
  id: 'r1',
  championshipId: 'c1',
  name: 'Titã',
  team: 'Equipe Volt',
  weightClass: 'lightweight',
}

let token = ''
let confirmSpy: ReturnType<typeof vi.spyOn>

async function mountView(path: string, attach = false) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/manage', name: 'my-championships', component: stub },
      {
        path: '/manage/:championshipId/participants',
        name: 'championship-participants',
        component: stub,
      },
      {
        path: '/manage/:championshipId/participants/new',
        name: 'participant-create',
        component: ParticipantFormView,
        props: (route) => ({ mode: 'create', championshipId: route.params.championshipId }),
      },
      {
        path: '/manage/:championshipId/participants/:robotId/edit',
        name: 'participant-edit',
        component: ParticipantFormView,
        props: (route) => ({
          mode: 'edit',
          championshipId: route.params.championshipId,
          robotId: route.params.robotId,
        }),
      },
    ],
  })
  await router.push(path)
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(
    { template: '<RouterView />' },
    { global: { plugins: [pinia, router] }, ...(attach && { attachTo: document.body }) },
  )
  await flushPromises()
  return { wrapper, router }
}

type Wrapper = Awaited<ReturnType<typeof mountView>>['wrapper']

const input = (wrapper: Wrapper, name: string) =>
  wrapper.get<HTMLInputElement>(`input[name="${name}"]`)
const buttonByText = (wrapper: Wrapper, text: string) =>
  wrapper.findAll('button').find((b) => b.text() === text)
const cancelLink = (wrapper: Wrapper) => wrapper.findAll('a').find((a) => a.text() === 'Cancelar')!
const crumbs = (wrapper: Wrapper) =>
  wrapper.findAll('nav li:not([aria-hidden])').map((li) => li.text())

type WeightClassLabel = 'Peso leve' | 'Peso pesado'

const weightClassPicker = (wrapper: Wrapper) => wrapper.get('[role="combobox"]')

async function pickWeightClass(wrapper: Wrapper, label: WeightClassLabel) {
  await weightClassPicker(wrapper).trigger('click')
  await wrapper
    .findAll('[role="option"]')
    .find((option) => option.text().includes(label))!
    .trigger('click')
}

async function fill(
  wrapper: Wrapper,
  values: { name: string; team: string; weightClass: WeightClassLabel },
) {
  await input(wrapper, 'name').setValue(values.name)
  await input(wrapper, 'team').setValue(values.team)
  await pickWeightClass(wrapper, values.weightClass)
}

async function submit(wrapper: Wrapper) {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('ParticipantFormView', () => {
  beforeEach(() => {
    localStorage.clear()
    token = liveToken()
    vi.mocked(getChampionship).mockReset().mockResolvedValue(championship)
    vi.mocked(getRobots).mockReset().mockResolvedValue([tita])
    vi.mocked(createRobot).mockReset()
    vi.mocked(updateRobot).mockReset()
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  })
  afterEach(() => {
    confirmSpy.mockRestore()
  })

  it('create: starts empty with the create breadcrumb, title and actions', async () => {
    const { wrapper } = await mountView('/manage/c1/participants/new')

    expect(input(wrapper, 'name').element.value).toBe('')
    expect(crumbs(wrapper)).toEqual([
      'Meus campeonatos',
      'Copa 2026',
      'Participantes',
      'Novo participante',
    ])
    expect(wrapper.get('h1').text()).toBe('Adicionar participante')
    expect(buttonByText(wrapper, 'Salvar e adicionar outro')).toBeDefined()
    expect(wrapper.get('button[type="submit"]').text()).toBe('Adicionar participante')
    expect(cancelLink(wrapper).attributes('href')).toBe('/manage/c1/participants')
    expect(getRobots).not.toHaveBeenCalled()
  })

  it('create: submitting empty shows the required messages and does not save', async () => {
    const { wrapper } = await mountView('/manage/c1/participants/new')

    await submit(wrapper)

    expect(wrapper.text()).toContain(PARTICIPANT_MESSAGES.nameRequired)
    expect(wrapper.text()).toContain(PARTICIPANT_MESSAGES.teamRequired)
    expect(wrapper.text()).toContain(PARTICIPANT_MESSAGES.weightClassRequired)
    expect(createRobot).not.toHaveBeenCalled()
  })

  it('create: saves the normalized input and returns to the list without confirming', async () => {
    vi.mocked(createRobot).mockResolvedValue(tita)
    const { wrapper, router } = await mountView('/manage/c1/participants/new')

    await fill(wrapper, { name: '  Titã ', team: 'Equipe   Volt', weightClass: 'Peso leve' })
    await submit(wrapper)

    expect(createRobot).toHaveBeenCalledWith(
      'c1',
      { name: 'Titã', team: 'Equipe Volt', weightClass: 'lightweight' },
      token,
    )
    expect(router.currentRoute.value.name).toBe('championship-participants')
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('create: "Salvar e adicionar outro" saves, clears the form and focuses the name', async () => {
    vi.mocked(createRobot).mockResolvedValue(tita)
    const { wrapper, router } = await mountView('/manage/c1/participants/new', true)

    await fill(wrapper, { name: 'Titã', team: 'Equipe Volt', weightClass: 'Peso leve' })
    await buttonByText(wrapper, 'Salvar e adicionar outro')!.trigger('click')
    await flushPromises()

    expect(createRobot).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.name).toBe('participant-create')
    expect(input(wrapper, 'name').element.value).toBe('')
    expect(input(wrapper, 'team').element.value).toBe('')
    expect(weightClassPicker(wrapper).text()).toBe('Escolha a categoria')
    expect(document.activeElement).toBe(input(wrapper, 'name').element)
    expect(wrapper.get('[role="status"]').text()).toBe('Titã foi adicionado.')
    expect(wrapper.text()).not.toContain(PARTICIPANT_MESSAGES.nameRequired)
    wrapper.unmount()
  })

  it('ignores a second submit while saving', async () => {
    let resolve: (value: Robot) => void = () => {}
    vi.mocked(createRobot).mockReturnValue(new Promise((r) => (resolve = r)))
    const { wrapper } = await mountView('/manage/c1/participants/new')
    await fill(wrapper, { name: 'Titã', team: 'Equipe Volt', weightClass: 'Peso leve' })

    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')

    expect(createRobot).toHaveBeenCalledTimes(1)
    expect(wrapper.get('button[type="submit"]').attributes('aria-busy')).toBe('true')
    resolve(tita)
    await flushPromises()
  })

  it('maps a taken name to the name field', async () => {
    vi.mocked(createRobot).mockRejectedValue(
      new ApiError(409, 'robot_name_taken', ['robot_name_taken']),
    )
    const { wrapper } = await mountView('/manage/c1/participants/new')
    await fill(wrapper, { name: 'Titã', team: 'Equipe Volt', weightClass: 'Peso leve' })

    await submit(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toBe(PARTICIPANT_MESSAGES.reviewFields)
    expect(wrapper.text()).toContain(PARTICIPANT_MESSAGES.nameTaken)
    expect(input(wrapper, 'name').attributes('aria-invalid')).toBe('true')
  })

  it('updates the preview as the user types', async () => {
    const { wrapper } = await mountView('/manage/c1/participants/new')
    const tile = () => wrapper.get('.competitor-tile')

    expect(tile().text()).toContain('Lado A · Equipe')
    expect(tile().text()).toContain('Nome do robô')

    await fill(wrapper, { name: 'Titã', team: 'Equipe Volt', weightClass: 'Peso pesado' })

    expect(tile().text()).toContain('Lado A · Equipe Volt')
    expect(tile().text()).toContain('Titã')
    expect(tile().text()).toContain('Peso pesado')
  })

  it('edit: pre-fills the robot and saves with a single button', async () => {
    vi.mocked(updateRobot).mockResolvedValue({ ...tita, team: 'Equipe Nova' })
    const { wrapper, router } = await mountView('/manage/c1/participants/r1/edit')

    expect(getRobots).toHaveBeenCalledWith('c1')
    expect(input(wrapper, 'name').element.value).toBe('Titã')
    expect(weightClassPicker(wrapper).text()).toBe('Peso leve')
    expect(wrapper.get('h1').text()).toBe('Editar participante')
    expect(crumbs(wrapper).at(-1)).toBe('Editar participante')
    expect(buttonByText(wrapper, 'Salvar e adicionar outro')).toBeUndefined()
    expect(wrapper.get('button[type="submit"]').text()).toBe('Salvar alterações')

    await input(wrapper, 'team').setValue('Equipe Nova')
    await submit(wrapper)

    expect(updateRobot).toHaveBeenCalledWith(
      'r1',
      { name: 'Titã', team: 'Equipe Nova', weightClass: 'lightweight' },
      token,
    )
    expect(router.currentRoute.value.name).toBe('championship-participants')
  })

  it('edit: explains why the weight class cannot change', async () => {
    vi.mocked(updateRobot).mockRejectedValue(
      new ApiError(409, 'robot_has_matches', ['robot_has_matches']),
    )
    const { wrapper } = await mountView('/manage/c1/participants/r1/edit')

    await pickWeightClass(wrapper, 'Peso pesado')
    await submit(wrapper)

    expect(wrapper.text()).toContain(PARTICIPANT_MESSAGES.weightClassLocked)
    expect(weightClassPicker(wrapper).attributes('aria-invalid')).toBe('true')
  })

  it('edit: asks for a weight class when the saved one is not one of the two', async () => {
    vi.mocked(getRobots).mockResolvedValue([{ ...tita, weightClass: '3 kg' }])
    const { wrapper } = await mountView('/manage/c1/participants/r1/edit')

    expect(weightClassPicker(wrapper).text()).toBe('Escolha a categoria')
    await submit(wrapper)

    expect(wrapper.text()).toContain(PARTICIPANT_MESSAGES.weightClassRequired)
    expect(updateRobot).not.toHaveBeenCalled()
  })

  it('edit: shows not found for an unknown robot, with a way back to the list', async () => {
    const { wrapper } = await mountView('/manage/c1/participants/nope/edit')

    expect(wrapper.text()).toContain('Participante não encontrado.')
    expect(wrapper.find('form').exists()).toBe(false)
    const back = wrapper.findAll('a').find((a) => a.text() === 'Voltar para participantes')!
    expect(back.attributes('href')).toBe('/manage/c1/participants')
  })

  it('shows not found for an unknown championship', async () => {
    vi.mocked(getChampionship).mockResolvedValue(null)
    const { wrapper } = await mountView('/manage/nope/participants/new')

    expect(wrapper.text()).toContain('Campeonato não encontrado.')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('shows a retry panel when loading fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getRobots).mockRejectedValueOnce(new Error('boom'))
    const { wrapper } = await mountView('/manage/c1/participants/r1/edit')

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Não foi possível carregar o participante.',
    )
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()

    expect(input(wrapper, 'name').element.value).toBe('Titã')
    error.mockRestore()
  })

  it('asks before leaving with unsaved changes', async () => {
    const { wrapper, router } = await mountView('/manage/c1/participants/new')
    await input(wrapper, 'name').setValue('Titã')

    confirmSpy.mockReturnValue(false)
    await cancelLink(wrapper).trigger('click')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledWith(LEAVE_MESSAGE)
    expect(router.currentRoute.value.name).toBe('participant-create')

    confirmSpy.mockReturnValue(true)
    await cancelLink(wrapper).trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('championship-participants')
  })
})
