import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/ibm-plex-mono/500.css'

import './styles/tokens.css'
import './styles/typography.css'
import './styles/base.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { setUnauthorizedHandler } from './api/client'
import { useAuthStore } from './stores/auth'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// An expired or revoked token (401 on an authenticated request) ends the session
setUnauthorizedHandler(() => {
  useAuthStore().signOut()
  const current = router.currentRoute.value
  if (current.matched.some((record) => record.meta.requiresAuth)) {
    void router.push({ name: 'sign-in', query: { redirect: current.fullPath } })
  }
})

app.mount('#app')
