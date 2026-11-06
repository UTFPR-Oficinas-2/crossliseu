import { describe, expect, it } from 'vitest'

import router from '../index'
import routerSource from '../index.ts?raw'

// Local, `dev` and production must show the same screens, so no route may depend on the build mode.
describe('router registration', () => {
  it('registers every screen', () => {
    const names = router.getRoutes().map((route) => route.name)

    for (const name of [
      'home',
      'sign-in',
      'championship',
      'match-details',
      'my-championships',
      'championship-create',
      'championship-participants',
      'championship-matches',
      'championship-settings',
      'match-operation',
      'referee-session',
      'referee-invalid-access',
      'dev-components',
      'not-found',
    ]) {
      expect(names).toContain(name)
    }
  })

  it('does not gate routes on the build mode', () => {
    expect(routerSource).not.toMatch(/import\.meta\.env\.(DEV|PROD|MODE)/)
  })
})
