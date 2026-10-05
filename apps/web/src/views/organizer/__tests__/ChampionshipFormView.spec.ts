import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import { TOKEN_STORAGE_KEY } from '@/stores/auth'
import { liveToken } from '@/stores/__tests__/token-helpers'
import type { ChampionshipInput } from '@/mocks'
import type { Championship } from '@/types'
import ChampionshipFormView from '../ChampionshipFormView.vue'
import { FORM_MESSAGES } from '../championship-form'

vi.mock('@/mocks', () => ({
  getChampionship: vi.fn<(id: string) => Promise<Championship | null>>(),
  createChampionship: vi.fn<(input: ChampionshipInput, token: string) => Promise<Championship>>(),
  updateChampionship:
    vi.fn<(id: string, input: ChampionshipInput, token: string) => Promise<Championship>>(),
}))
import { createChampionship, getChampionship, updateChampionship } from '@/mocks'

const stub = { render: () => null }
const LEAVE_MESSAGE = 'Há alterações não salvas. Deseja sair mesmo assim?'

const row = (overrides: Partial<Championship> = {}): Championship => ({
  id: 'c1',
  name: 'Copa 2026',
  startDate: '2026-12-09T00:00:00.000Z',
  endDate: '2026-12-10T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  modifiedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

let token = ''
let confirmSpy: ReturnType<typeof vi.spyOn>

async function mountView(path: string, attach = false) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/manage', name: 'my-championships', component: stub },
      {
        path: '/manage/new',
        name: 'championship-create',
        component: ChampionshipFormView,
        props: { mode: 'create' },
      },
      { path: '/manage/:championshipId', name: 'championship-overview', component: stub },
      {
        path: '/manage/:championshipId/settings',
        name: 'championship-settings',
        component: ChampionshipFormView,
        props: (route) => ({ mode: 'edit', championshipId: route.params.championshipId }),
      },
    ],
  })
  await router.push(path)
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(
    { template: '<RouterView />' },
    {
      global: { plugins: [pinia, router] },
      ...(attach && { attachTo: document.body }),
    },
  )
  await flushPromises()
  return { wrapper, router }
}

type Wrapper = Awaited<ReturnType<typeof mountView>>['wrapper']

const input = (wrapper: Wrapper, name: string) =>
  wrapper.get<HTMLInputElement>(`input[name="${name}"]`)

async function fill(wrapper: Wrapper, name: string, startDate: string, endDate: string) {
  await input(wrapper, 'name').setValue(name)
  await input(wrapper, 'startDate').setValue(startDate)
  await input(wrapper, 'endDate').setValue(endDate)
}

async function submit(wrapper: Wrapper) {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

const cancelLink = (wrapper: Wrapper) => wrapper.findAll('a').find((a) => a.text() === 'Cancelar')!

describe('ChampionshipFormView', () => {
  beforeEach(() => {
    localStorage.clear()
    token = liveToken()
    vi.mocked(getChampionship).mockReset()
    vi.mocked(createChampionship).mockReset()
    vi.mocked(updateChampionship).mockReset()
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  })
  afterEach(() => {
    confirmSpy.mockRestore()
  })

  it('create: starts empty with the create breadcrumb and title', async () => {
    const { wrapper } = await mountView('/manage/new')

    expect(input(wrapper, 'name').element.value).toBe('')
    expect(input(wrapper, 'startDate').element.value).toBe('')
    expect(input(wrapper, 'endDate').element.value).toBe('')
    const link = wrapper.get('nav a')
    expect(link.text()).toBe('Meus campeonatos')
    expect(link.attributes('href')).toBe('/manage')
    expect(wrapper.get('nav').text()).toContain('Novo campeonato')
    expect(wrapper.get('h1').text()).toBe('Criar campeonato')
  })

  it('create: submitting empty shows the required messages and does not save', async () => {
    const { wrapper } = await mountView('/manage/new')

    await submit(wrapper)

    expect(wrapper.text()).toContain(FORM_MESSAGES.nameRequired)
    expect(wrapper.text()).toContain(FORM_MESSAGES.startRequired)
    expect(wrapper.text()).toContain(FORM_MESSAGES.endRequired)
    expect(createChampionship).not.toHaveBeenCalled()
  })

  it('validates a field on blur, only for touched fields', async () => {
    const { wrapper } = await mountView('/manage/new')

    await input(wrapper, 'startDate').setValue('2026-12-10')
    await input(wrapper, 'endDate').setValue('2026-12-09')
    expect(wrapper.text()).not.toContain(FORM_MESSAGES.endBeforeStart)

    await input(wrapper, 'endDate').trigger('focusout')

    expect(wrapper.text()).toContain(FORM_MESSAGES.endBeforeStart)
    expect(wrapper.text()).not.toContain(FORM_MESSAGES.nameRequired)
  })

  it('create: saves the trimmed input and opens the overview without confirming', async () => {
    vi.mocked(createChampionship).mockResolvedValue(row({ id: 'new-id' }))
    const { wrapper, router } = await mountView('/manage/new')

    await fill(wrapper, '  Copa  ', '2026-12-09', '2026-12-10')
    await submit(wrapper)

    expect(createChampionship).toHaveBeenCalledWith(
      { name: 'Copa', startDate: '2026-12-09', endDate: '2026-12-10' },
      token,
    )
    expect(router.currentRoute.value.name).toBe('championship-overview')
    expect(router.currentRoute.value.params.championshipId).toBe('new-id')
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('disables the submit button while saving and ignores a second submit', async () => {
    let resolve: (value: Championship) => void = () => {}
    vi.mocked(createChampionship).mockReturnValue(new Promise((r) => (resolve = r)))
    const { wrapper } = await mountView('/manage/new')
    await fill(wrapper, 'Copa', '2026-12-09', '2026-12-10')

    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')

    const button = wrapper.get('button[type="submit"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('aria-busy')).toBe('true')
    expect(createChampionship).toHaveBeenCalledTimes(1)

    resolve(row({ id: 'new-id' }))
    await flushPromises()
  })

  it('shows the connection banner when the request never got a response', async () => {
    vi.mocked(createChampionship).mockRejectedValue(new ApiError(0, 'Failed to fetch'))
    const { wrapper } = await mountView('/manage/new')
    await fill(wrapper, 'Copa', '2026-12-09', '2026-12-10')

    await submit(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toBe(FORM_MESSAGES.noConnection)
  })

  it('maps an API 400 to the banner and the field error', async () => {
    vi.mocked(createChampionship).mockRejectedValue(
      new ApiError(400, 'Bad Request', ['championship_end_before_start']),
    )
    const { wrapper } = await mountView('/manage/new')
    await fill(wrapper, 'Copa', '2026-12-09', '2026-12-10')

    await submit(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toBe(FORM_MESSAGES.reviewFields)
    expect(wrapper.text()).toContain(FORM_MESSAGES.endBeforeStart)
  })

  it('edit: pre-fills the form and shows the edit breadcrumb and title', async () => {
    vi.mocked(getChampionship).mockResolvedValue(row())
    const { wrapper } = await mountView('/manage/c1/settings')

    expect(getChampionship).toHaveBeenCalledWith('c1')
    expect(input(wrapper, 'name').element.value).toBe('Copa 2026')
    expect(input(wrapper, 'startDate').element.value).toBe('2026-12-09')
    expect(input(wrapper, 'endDate').element.value).toBe('2026-12-10')
    expect(wrapper.findAll('nav li:not([aria-hidden])').map((li) => li.text())).toEqual([
      'Meus campeonatos',
      'Copa 2026',
      'Configurações',
    ])
    expect(wrapper.findAll('nav a')).toHaveLength(1)
    expect(wrapper.get('h1').text()).toBe('Editar campeonato')
  })

  it('edit: saves, stays on the page and keeps the confirmation visible', async () => {
    vi.mocked(getChampionship).mockResolvedValue(row())
    vi.mocked(updateChampionship).mockResolvedValue(row({ name: 'Copa Nova (salva)' }))
    const { wrapper, router } = await mountView('/manage/c1/settings')

    await input(wrapper, 'name').setValue('Copa Nova')
    await submit(wrapper)

    expect(updateChampionship).toHaveBeenCalledWith(
      'c1',
      { name: 'Copa Nova', startDate: '2026-12-09', endDate: '2026-12-10' },
      token,
    )
    expect(router.currentRoute.value.name).toBe('championship-settings')
    expect(input(wrapper, 'name').element.value).toBe('Copa Nova (salva)')
    expect(wrapper.get('[role="status"]').text()).toBe('Alterações salvas.')
  })

  it('edit: shows a not-found message and no form', async () => {
    vi.mocked(getChampionship).mockResolvedValue(null)
    const { wrapper } = await mountView('/manage/nope/settings')

    expect(wrapper.text()).toContain('Campeonato não encontrado.')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('edit: shows a retry panel when loading fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getChampionship).mockRejectedValueOnce(new Error('boom'))
    vi.mocked(getChampionship).mockResolvedValueOnce(row())
    const { wrapper } = await mountView('/manage/c1/settings')

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Não foi possível carregar o campeonato.',
    )
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()

    expect(input(wrapper, 'name').element.value).toBe('Copa 2026')
    error.mockRestore()
  })

  it('ignores a stale load when the id changes meanwhile', async () => {
    let resolveC1: (value: Championship | null) => void = () => {}
    vi.mocked(getChampionship).mockImplementation((id) =>
      id === 'c1'
        ? new Promise((r) => (resolveC1 = r))
        : Promise.resolve(row({ id: 'c2', name: 'Copa Dois' })),
    )
    const { wrapper, router } = await mountView('/manage/c1/settings')

    await router.push('/manage/c2/settings')
    await flushPromises()
    resolveC1(row({ id: 'c1', name: 'Copa Um' }))
    await flushPromises()

    expect(input(wrapper, 'name').element.value).toBe('Copa Dois')
    expect(wrapper.get('nav').text()).toContain('Copa Dois')
    expect(wrapper.get('nav').text()).not.toContain('Copa Um')
  })

  it('does not redirect after the user left during an in-flight create', async () => {
    let resolve: (value: Championship) => void = () => {}
    vi.mocked(createChampionship).mockReturnValue(new Promise((r) => (resolve = r)))
    const { wrapper, router } = await mountView('/manage/new')
    await fill(wrapper, 'Copa', '2026-12-09', '2026-12-10')
    await wrapper.get('form').trigger('submit')

    await cancelLink(wrapper).trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/manage')

    resolve(row({ id: 'new-id' }))
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/manage')
  })

  it('focuses the first invalid field after a failed submit', async () => {
    const { wrapper } = await mountView('/manage/new', true)

    await submit(wrapper)

    expect(document.activeElement).toBe(input(wrapper, 'name').element)
    wrapper.unmount()
  })

  it('clears the saved confirmation when a new submit starts', async () => {
    vi.mocked(getChampionship).mockResolvedValue(row())
    vi.mocked(updateChampionship).mockResolvedValueOnce(row())
    const { wrapper } = await mountView('/manage/c1/settings')
    await submit(wrapper)
    expect(wrapper.get('[role="status"]').text()).toBe('Alterações salvas.')

    vi.mocked(updateChampionship).mockRejectedValueOnce(new ApiError(0, 'x'))
    await submit(wrapper)

    expect(wrapper.get('[role="status"]').text()).toBe('')
    expect(wrapper.get('[role="alert"]').text()).toBe(FORM_MESSAGES.noConnection)
  })

  it('asks before leaving with unsaved changes', async () => {
    const { wrapper, router } = await mountView('/manage/new')
    await input(wrapper, 'name').setValue('Copa')

    confirmSpy.mockReturnValue(false)
    await cancelLink(wrapper).trigger('click')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledWith(LEAVE_MESSAGE)
    expect(router.currentRoute.value.fullPath).toBe('/manage/new')

    confirmSpy.mockReturnValue(true)
    await cancelLink(wrapper).trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/manage')
  })

  it('does not ask when nothing changed, and cancel goes to the overview in edit mode', async () => {
    vi.mocked(getChampionship).mockResolvedValue(row())
    const { wrapper, router } = await mountView('/manage/c1/settings')

    expect(cancelLink(wrapper).attributes('href')).toBe('/manage/c1')
    await cancelLink(wrapper).trigger('click')
    await flushPromises()

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe('/manage/c1')
  })
})
