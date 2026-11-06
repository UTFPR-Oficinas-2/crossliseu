import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import { TOKEN_STORAGE_KEY } from '@/stores/auth'
import { liveToken } from '@/stores/__tests__/token-helpers'
import type { DeviceCredentials, ManagedArena } from '@/types'
import { buildArenaConfig } from '@/utils/arena-config'
import ArenasView from '../ArenasView.vue'

vi.mock('@/data', () => ({
  getMyArenas: vi.fn<(token: string) => Promise<ManagedArena[]>>(),
  addArena:
    vi.fn<
      (
        name: string,
        token: string,
      ) => Promise<{ arena: ManagedArena; credentials: DeviceCredentials }>
    >(),
  renameArena: vi.fn<(id: string, name: string, token: string) => Promise<ManagedArena>>(),
  newArenaToken: vi.fn<(id: string, token: string) => Promise<DeviceCredentials>>(),
  removeArena: vi.fn<(id: string, token: string) => Promise<void>>(),
}))
import { addArena, getMyArenas, newArenaToken, removeArena, renameArena } from '@/data'

const stub = { render: () => null }
const token = liveToken()

const arenas: ManagedArena[] = [
  {
    id: 'a1',
    name: 'Arena 1',
    deviceId: 'arena-1-ab12',
    currentMatch: { robotAName: 'Titã', robotBName: 'Marte' },
  },
  { id: 'a2', name: 'Arena 2', deviceId: 'arena-2-cd34', currentMatch: null },
]
const credentials: DeviceCredentials = {
  deviceId: 'arena-3-ef56',
  token: 'plain-secret-token',
  serverUrl: 'https://crossliseu.example',
}
const rotated: DeviceCredentials = {
  ...credentials,
  deviceId: 'arena-1-ab12',
  token: 'rotated-tok',
}

async function mountView() {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/manage', name: 'my-championships', component: stub },
      { path: '/manage/arenas', name: 'arenas', component: ArenasView },
    ],
  })
  await router.push('/manage/arenas')
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
type Wrapper = Awaited<ReturnType<typeof mountView>>

const button = (w: Wrapper, label: string, index = 0) =>
  w.findAll('button').filter((b) => b.text() === label)[index]!
const rows = (w: Wrapper) => w.findAll('li')

async function createArenaNamed(w: Wrapper, name: string) {
  if (!w.find('form').exists()) await button(w, 'Nova arena').trigger('click')
  await w.find('input').setValue(name)
  await w.find('form').trigger('submit')
  await flushPromises()
}

describe('ArenasView', () => {
  beforeEach(() => {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
    for (const fn of [getMyArenas, addArena, renameArena, newArenaToken, removeArena]) {
      vi.mocked(fn).mockReset()
    }
    vi.mocked(getMyArenas).mockResolvedValue(arenas)
    vi.mocked(addArena).mockResolvedValue({
      arena: { id: 'a3', name: 'Arena 3', deviceId: 'arena-3-ef56', currentMatch: null },
      credentials,
    })
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    )
  })

  it('lists rows with device id and the running match, and no status pill', async () => {
    const w = await mountView()

    expect(getMyArenas).toHaveBeenCalledWith(token)
    expect(rows(w)).toHaveLength(2)
    expect(rows(w)[0]!.text()).toContain('arena-1-ab12 · rodando Titã × Marte')
    expect(rows(w)[1]!.text()).toContain('arena-2-cd34')
    expect(rows(w)[1]!.text()).not.toContain('rodando')
    expect(w.text().toLowerCase()).not.toContain('não conectado')
  })

  it('says arenas apply to every championship and are private', async () => {
    const w = await mountView()

    expect(w.text()).toContain('As arenas valem para todos os campeonatos')
    expect(w.text()).toContain('Só você vê as suas arenas')
  })

  it('shows a load error with retry', async () => {
    vi.mocked(getMyArenas).mockRejectedValueOnce(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = await mountView()

    expect(w.find('[role="alert"]').exists()).toBe(true)
    await button(w, 'Tentar novamente').trigger('click')
    await flushPromises()
    expect(rows(w)).toHaveLength(2)
  })

  it('creates an arena and shows the config.h panel with the warning', async () => {
    const w = await mountView()
    await createArenaNamed(w, '  Arena   3 ')

    expect(addArena).toHaveBeenCalledWith('Arena 3', token)
    expect(rows(w)).toHaveLength(3)
    expect(w.find('pre').text()).toBe(buildArenaConfig('Arena 3', credentials).trim())
    expect(w.text()).toContain('Copie agora')
    expect(w.text()).toContain('não aparece de novo')
    expect(w.text()).toContain('a caixa antiga deixa de conectar')
  })

  it('validates the name on the client', async () => {
    const w = await mountView()
    await createArenaNamed(w, '   ')
    expect(addArena).not.toHaveBeenCalled()
    expect(w.text()).toContain('Informe o nome da arena.')

    await createArenaNamed(w, 'x'.repeat(41))
    expect(addArena).not.toHaveBeenCalled()
    expect(w.text()).toContain('no máximo 40')
  })

  it('maps arena_name_taken on create to a field error', async () => {
    vi.mocked(addArena).mockRejectedValueOnce(new ApiError(409, 'Conflict', ['arena_name_taken']))
    const w = await mountView()
    await createArenaNamed(w, 'Arena 1')

    expect(w.text()).toContain('Você já tem uma arena com esse nome.')
    expect(rows(w)).toHaveLength(2)
    expect(w.find('pre').exists()).toBe(false)
  })

  it('downloads config.h and copies the same text', async () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:x')
    const revokeObjectURL = vi.fn<(url: string) => void>()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const w = await mountView()
    await createArenaNamed(w, 'Arena 3')

    await button(w, 'Baixar config.h').trigger('click')
    const blob = (createObjectURL.mock.calls as unknown as [Blob][])[0]![0]
    expect(blob).toBeInstanceOf(Blob)
    expect(await blob.text()).toBe(buildArenaConfig('Arena 3', credentials))
    expect(click).toHaveBeenCalled()
    const anchor = click.mock.contexts[0] as HTMLAnchorElement
    expect(anchor.download).toBe('config.h')

    await button(w, 'Copiar').trigger('click')
    expect(writeText).toHaveBeenCalledWith(buildArenaConfig('Arena 3', credentials))
  })

  it('asks before a new token; declining does nothing, accepting shows the panel', async () => {
    vi.mocked(newArenaToken).mockResolvedValue(rotated)
    const confirm = vi.mocked(window.confirm)
    const w = await mountView()

    confirm.mockReturnValueOnce(false)
    await button(w, 'Gerar novo token').trigger('click')
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(newArenaToken).not.toHaveBeenCalled()
    expect(w.find('pre').exists()).toBe(false)

    await button(w, 'Gerar novo token').trigger('click')
    await flushPromises()
    expect(newArenaToken).toHaveBeenCalledWith('a1', token)
    expect(w.find('pre').text()).toBe(buildArenaConfig('Arena 1', rotated).trim())
  })

  it('removes an arena after confirmation', async () => {
    vi.mocked(removeArena).mockResolvedValue()
    const confirm = vi.mocked(window.confirm)
    const w = await mountView()

    confirm.mockReturnValueOnce(false)
    await button(w, 'Remover').trigger('click')
    expect(removeArena).not.toHaveBeenCalled()

    await button(w, 'Remover').trigger('click')
    await flushPromises()
    expect(removeArena).toHaveBeenCalledWith('a1', token)
    expect(rows(w)).toHaveLength(1)
    expect(w.text()).not.toContain('Arena 1')
  })

  it.each([
    ['Remover', () => vi.mocked(removeArena)],
    ['Gerar novo token', () => vi.mocked(newArenaToken)],
  ])('shows the live-match message when %s is refused', async (label, mock) => {
    mock().mockRejectedValueOnce(new ApiError(409, 'Conflict', ['arena_match_live']))
    const w = await mountView()
    await button(w, label).trigger('click')
    await flushPromises()

    expect(w.text()).toContain('Esta arena está com uma luta em andamento')
    expect(rows(w)).toHaveLength(2)
    expect(w.find('pre').exists()).toBe(false)
  })

  it('renames inline and updates the row', async () => {
    vi.mocked(renameArena).mockResolvedValue({ ...arenas[0]!, name: 'Principal' })
    const w = await mountView()
    await button(w, 'Renomear').trigger('click')
    const input = rows(w)[0]!.find('input')
    expect(input.element.value).toBe('Arena 1')
    await input.setValue('  Principal ')
    await rows(w)[0]!.find('form').trigger('submit')
    await flushPromises()

    expect(renameArena).toHaveBeenCalledWith('a1', 'Principal', token)
    expect(rows(w)[0]!.text()).toContain('Principal')
    expect(rows(w)[0]!.find('input').exists()).toBe(false)
  })

  it('keeps the old name and shows a field error when the new one is taken', async () => {
    vi.mocked(renameArena).mockRejectedValueOnce(
      new ApiError(409, 'Conflict', ['arena_name_taken']),
    )
    const w = await mountView()
    await button(w, 'Renomear').trigger('click')
    await rows(w)[0]!.find('input').setValue('Arena 2')
    await rows(w)[0]!.find('form').trigger('submit')
    await flushPromises()

    expect(rows(w)[0]!.text()).toContain('Você já tem uma arena com esse nome.')
    await button(w, 'Cancelar').trigger('click')
    expect(rows(w)[0]!.text()).toContain('Arena 1')
    expect(rows(w)[0]!.text()).not.toContain('Arena 2 ')
  })

  it('opens the form from "Nova arena" and closes it with Cancelar', async () => {
    const w = await mountView()
    expect(w.find('form').exists()).toBe(false)

    await button(w, 'Nova arena').trigger('click')
    expect(w.find('form').text()).toContain('Aparece para o operador e na caixa da arena.')
    await button(w, 'Cancelar').trigger('click')
    expect(w.find('form').exists()).toBe(false)
  })

  it('dismisses the panel with Pronto', async () => {
    const w = await mountView()
    await createArenaNamed(w, 'Arena 3')
    await button(w, 'Pronto').trigger('click')
    expect(w.find('pre').exists()).toBe(false)
  })

  it('clears the panel when another arena is created, and keeps nothing in storage', async () => {
    const w = await mountView()
    await createArenaNamed(w, 'Arena 3')
    expect(w.find('pre').text()).toContain('plain-secret-token')

    vi.mocked(addArena).mockRejectedValueOnce(new ApiError(0, 'offline'))
    await createArenaNamed(w, 'Arena 4')
    expect(w.find('pre').exists()).toBe(false)

    await createArenaNamed(w, 'Arena 3')
    expect(JSON.stringify({ ...localStorage })).not.toContain('plain-secret-token')
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('plain-secret-token')
    w.unmount()
    expect(document.body.innerHTML).not.toContain('plain-secret-token')
  })

  it('clears the panel on remove and rename of another arena', async () => {
    vi.mocked(removeArena).mockResolvedValue()
    const w = await mountView()
    await createArenaNamed(w, 'Arena 3')
    await button(w, 'Remover', 1).trigger('click')
    await flushPromises()
    expect(w.find('pre').exists()).toBe(false)
  })
})
