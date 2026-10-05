# Crossliseu Web

Vue 3 single-page app for following championships and fights. Part of the [Crossliseu](../../README.md) monorepo.

## Requirements

- Node `^22.18.0 || >=24.12.0`
- The [API](../api/README.md) running, to use real data (optional in development)

## Getting started

```bash
npm ci
npm run dev                # http://localhost:5173
```

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check, then build for production |
| `npm run build-only` | Build without type-checking |
| `npm run preview` | Serve the production build locally |
| `npm run type-check` | Type-check with vue-tsc |
| `npm run lint` | Run oxlint and ESLint (**auto-fixes** files) |
| `npm run format` | Format `src/` with Prettier |
| `npm run test:unit` | Run unit tests (Vitest, watch mode) |

## Configuration

| Variable | When | Description |
| --- | --- | --- |
| `VITE_API_URL` | Build time | Base URL of the API. Use `/api` in development (proxied by Vite) and `/crossliseu/api` in production. |
| `API_PROXY_TARGET` | Dev server | Where `/api` is proxied to. Defaults to `http://localhost:3000`; use `http://api:3000` inside Docker Compose. |
| `BASE_PATH` | Docker build arg | Public path of the app. Defaults to `/`. |

Without `VITE_API_URL`, the dev server shows demo data instead of calling the API. Production builds fail without it.

To develop against a local API:

```bash
VITE_API_URL=/api npm run dev
```

## Routes

| Route | Availability |
| --- | --- |
| `/` | Homepage |
| `/sign-in` | Sign-in (needs the API) |
| `/manage/*`, `/operator/:matchId`, `/referee/:accessToken`, `/championships/:id`, `/matches/:id` | Prototype screens: development builds only, mock data |
| `/dev/components` | Component preview, development builds only |

## Contributing

Design tokens, the Figma workflow and code conventions are in [CLAUDE.md](CLAUDE.md). Run `npm run type-check` and `npm run lint` before opening a pull request.
