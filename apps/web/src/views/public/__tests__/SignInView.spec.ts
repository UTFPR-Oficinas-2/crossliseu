import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import { liveToken } from '@/stores/__tests__/token-helpers'
import SignInView from '../SignInView.vue'

vi.mock('@/mocks', () => ({ signIn: vi.fn<(u: string, p: string) => Promise<string>>() }))
import { signIn } from '@/mocks'

const stub = { render: () => null }

const WRONG_CREDENTIALS = 'Usuário ou senha incorretos. Verifique e tente novamente.'
const NO_CONNECTION = 'Não foi possível conectar ao servidor. Tente novamente.'
const GENERIC = 'Não foi possível entrar agora. Tente novamente.'

async function mountView(redirect?: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: stub },
      { path: '/sign-in', name: 'sign-in', component: SignInView },
      { path: '/manage', name: 'manage', component: stub },
    ],
  })
  await router.push(redirect === undefined ? '/sign-in' : { path: '/sign-in', query: { redirect } })
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  return { wrapper, router }
}

type Wrapper = Awaited<ReturnType<typeof mountView>>['wrapper']

async function fillAndSubmit(wrapper: Wrapper, username = 'admin', password = 'wrong') {
  await wrapper.get('input[name="username"]').setValue(username)
  await wrapper.get('input[type="password"]').setValue(password)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('SignInView', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(signIn).mockReset()
  })

  it('renders an empty form and no alert before submitting', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.get<HTMLInputElement>('input[name="username"]').element.value).toBe('')
    expect(wrapper.get<HTMLInputElement>('input[type="password"]').element.value).toBe('')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows the wrong-credentials banner on a 401 and keeps what was typed', async () => {
    vi.mocked(signIn).mockRejectedValue(new ApiError(401, 'Unauthorized'))
    const { wrapper } = await mountView()

    await fillAndSubmit(wrapper, 'admin', 'wrong')

    expect(wrapper.get('[role="alert"]').text()).toBe(WRONG_CREDENTIALS)
    expect(wrapper.get<HTMLInputElement>('input[name="username"]').element.value).toBe('admin')
    expect(wrapper.get<HTMLInputElement>('input[type="password"]').element.value).toBe('wrong')
  })

  it('hides the banner when either field is edited', async () => {
    vi.mocked(signIn).mockRejectedValue(new ApiError(401, 'Unauthorized'))
    const { wrapper } = await mountView()
    await fillAndSubmit(wrapper)

    await wrapper.get('input[name="username"]').setValue('admin2')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)

    await fillAndSubmit(wrapper)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await wrapper.get('input[type="password"]').setValue('other')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows the connection message when the request never got a response', async () => {
    vi.mocked(signIn).mockRejectedValue(new ApiError(0, 'Failed to fetch'))
    const { wrapper } = await mountView()

    await fillAndSubmit(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toBe(NO_CONNECTION)
  })

  it.each([new ApiError(500, 'Internal Server Error'), new Error('boom')])(
    'shows the generic message for %s',
    async (error) => {
      vi.mocked(signIn).mockRejectedValue(error)
      const { wrapper } = await mountView()

      await fillAndSubmit(wrapper)

      expect(wrapper.get('[role="alert"]').text()).toBe(GENERIC)
    },
  )

  it('disables the button while submitting and ignores a second submit', async () => {
    let resolve: (token: string) => void = () => {}
    vi.mocked(signIn).mockReturnValue(new Promise<string>((r) => (resolve = r)))
    const { wrapper } = await mountView()

    await wrapper.get('input[name="username"]').setValue('admin')
    await wrapper.get('input[type="password"]').setValue('secret')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')

    const button = wrapper.get('button[type="submit"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('aria-busy')).toBe('true')
    expect(button.text()).toBe('Entrar')
    expect(signIn).toHaveBeenCalledTimes(1)

    resolve(liveToken())
    await flushPromises()
  })

  it('goes to the redirect target after a successful sign-in', async () => {
    vi.mocked(signIn).mockResolvedValue(liveToken())
    const { wrapper, router } = await mountView('/manage')

    await fillAndSubmit(wrapper, 'admin', 'secret')

    expect(router.currentRoute.value.fullPath).toBe('/manage')
  })

  it.each(['//evil.com', 'https://evil.com', '/\\evil.com'])(
    'ignores the unsafe redirect %s and goes home',
    async (redirect) => {
      vi.mocked(signIn).mockResolvedValue(liveToken())
      const { wrapper, router } = await mountView(redirect)

      await fillAndSubmit(wrapper, 'admin', 'secret')

      expect(router.currentRoute.value.fullPath).toBe('/')
    },
  )

  it('goes home after a successful sign-in without a redirect', async () => {
    vi.mocked(signIn).mockResolvedValue(liveToken())
    const { wrapper, router } = await mountView()

    await fillAndSubmit(wrapper, 'admin', 'secret')

    expect(router.currentRoute.value.name).toBe('home')
  })
})
