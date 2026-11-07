# Crossliseu Web

Vue 3 single-page app for following championships and fights. Part of the [Crossliseu](../../README.md) monorepo.

## Requirements

- Node 26 (exact version in [`.nvmrc`](../../.nvmrc))
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

`VITE_API_URL` is required: the dev server and production builds both fail without it. There is no demo data; every screen reads from the API.

To develop against a local API:

```bash
VITE_API_URL=/api npm run dev
```

## Routes

| Route | Availability |
| --- | --- |
| `/` | Homepage |
| `/sign-in` | Sign-in (needs the API) |
| `/manage/*` | Organizer screens, backed by the API |
| `/operator/:matchId`, `/referee/:accessToken`, `/championships/:id`, `/matches/:id` | Built to the Figma specs; the API has no endpoints for them yet, so they show errors |
| `/dev/components` | Design-system component preview |

Every route is registered in every build.

## Contributing

Design tokens, the Figma workflow and code conventions are in [CLAUDE.md](CLAUDE.md). Run `npm run type-check` and `npm run lint` before opening a pull request.
