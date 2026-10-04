import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// Production builds always talk to apps/api; without a URL they would ship demo data.
function requireApiUrl(): Plugin {
  return {
    name: 'crossliseu:require-api-url',
    configResolved(config) {
      if (config.command === 'build' && config.isProduction && !config.env.VITE_API_URL) {
        throw new Error(
          'VITE_API_URL is required for production builds (e.g. VITE_API_URL=/crossliseu/api).',
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    requireApiUrl(),
  ],
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
