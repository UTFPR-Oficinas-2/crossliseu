import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// The app always talks to apps/api (there is no demo data), so the dev server and production
// builds both refuse to start without a URL. Vitest (mode `test`) is exempt.
function requireApiUrl(): Plugin {
  return {
    name: 'crossliseu:require-api-url',
    configResolved(config) {
      if (config.mode !== 'test' && !config.env.VITE_API_URL) {
        throw new Error(
          'VITE_API_URL is required (e.g. VITE_API_URL=/api in dev, /crossliseu/api in production).',
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools(), requireApiUrl()],
  server: {
    // Dev only: `VITE_API_URL=/api` reaches apps/api through this proxy, so the browser stays
    // same-origin (the API has no CORS). Mirrors production, where the host NGINX serves the API
    // at `/crossliseu/api/`. Inside docker compose set `API_PROXY_TARGET=http://api:3000`.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
