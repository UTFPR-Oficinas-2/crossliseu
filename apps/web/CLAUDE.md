# Crossliseu — Web frontend (`apps/web`)

Web app for the Crossliseu robot battle arena (UTFPR). Public viewers follow championships;
organizers manage them; an operator runs each fight; three referees score from their phones.

## Stack and commands

- Vue 3 (`<script setup lang="ts">`), TypeScript, Vite, Vue Router, Pinia, Vitest.
- Client-rendered SPA. The backend is NestJS in `apps/api`; live updates will use WebSockets.
- No Tailwind, no UI kit, no React. Styling is plain CSS with custom properties.
- Prettier: no semicolons, single quotes, print width 100.

```bash
npm run dev          # dev server
npm run type-check   # vue-tsc — must pass before you finish
npm run lint         # oxlint + eslint (auto-fix)
npm run format       # prettier on src/
npm run test:unit    # vitest
```

Before saying a task is done: run `type-check` and `lint`, and fix what they report.

## Figma source of truth

File: https://www.figma.com/design/kGzPxE42HygJmS0DEqQKwx (fileKey `kGzPxE42HygJmS0DEqQKwx`)

Sections: **Fundações** (variables, text styles, components), **Público**, **Organizador**,
**Operador**, **Árbitro (celular)**. Names, dates and counts in the file are demo data.

### How to implement a Figma node

1. Work from the node link the user gives you (one frame or component at a time). If you only
   have the file link, call `get_metadata` to find the node — don't pull a whole section.
2. Call `get_design_context` for the node, and `get_screenshot` when layout is unclear.
3. **The returned code is a React + Tailwind reference, not code to paste.** Translate it into
   Vue SFCs and scoped CSS that follow the rules below.
4. Map every Figma variable / text style to the existing tokens and classes. If a value has no
   token, stop and ask — don't hardcode it and don't invent a new token silently.
5. Reuse components from `src/components/ui/` first. Create a new one only if Figma has a
   component that doesn't exist in code yet, and build it as its own step.
6. Compare your result to `get_screenshot` and list any differences you couldn't resolve.

Figma MCP calls are rate-limited on our plan. Don't re-fetch a node you already have in context.

## Build order

Foundations → UI components → layouts → pages. Don't start a page whose components don't exist.

## Design tokens

Defined once in `src/styles/tokens.css` (from the Figma collection `Crossliseu / Industrial`).
Figma variable `camelCase` → CSS `--color-kebab-case`:

| Figma                                             | CSS                                             |
| ------------------------------------------------- | ----------------------------------------------- |
| `bg`, `panel`, `raised`                           | `--color-bg`, `--color-panel`, `--color-raised` |
| `border`, `borderSoft`                            | `--color-border`, `--color-border-soft`         |
| `text`, `muted`                                   | `--color-text`, `--color-muted`                 |
| `orange`, `green`, `blue`, `pink`, `red`, `amber` | `--color-orange`, …                             |
| `orangeDim`, `greenDim`, `redDim`                 | `--color-orange-dim`, …                         |

Spacing and radius values from Figma go into `--space-*` and `--radius-*` tokens in the same file.
Never write a hex color, `rgb()`, or one-off pixel spacing in a component.

## Typography

Fonts: **Barlow Condensed** (headings, big numerals), **Inter** (UI text),
**IBM Plex Mono** (timers, codes, technical labels). Self-host them with `@fontsource/*`
packages imported in `main.ts` — no Google Fonts `<link>`.

Figma text styles become classes in `src/styles/typography.css`:
`Heading / XL` → `.text-heading-xl`, `Timer / L` → `.text-timer-l`, `Overline` → `.text-overline`,
and so on for `Display`, `Heading`, `Numeric`, `Body`, `Label`, `Mono`, `Timer`.
Use these classes instead of setting font-family/size/weight in components.

## Project structure

```
src/
  styles/        tokens.css, typography.css, base.css (reset + body)
  components/
    ui/          design-system components (one per Figma component)
    icons/       inline SVG icons exported from Figma
  layouts/       PublicLayout, OrganizerLayout, OperatorLayout, RefereeLayout
  views/
    public/      HomeView, ChampionshipView, MatchDetailsView, SignInView, NotFoundView
    organizer/   MyChampionshipsView, ChampionshipFormView, OverviewView, ParticipantsView,
                 MatchesView
    operator/    MatchOperationView (one view, three states)
    referee/     RefereeSessionView (join → scoring → finished states), InvalidAccessView
    <section>/components/   blocks used only inside that section
  types/         domain types (Championship, Robot, Match, RefereeScore, …)
  mocks/         typed demo data used until the API exists
  stores/        Pinia stores
  router/
```

### Figma component → Vue file

| Figma                                                | Vue (`src/components/ui/`)                                |
| ---------------------------------------------------- | --------------------------------------------------------- |
| `Button / Primary · Secondary · Ghost · Destructive` | `AppButton.vue` (`variant` prop)                          |
| `Status / Pill`                                      | `StatusPill.vue`                                          |
| `Tab / Item`                                         | `TabItem.vue` (`active` prop)                             |
| `Sidebar / Item`                                     | `SidebarItem.vue` (`active` prop)                         |
| `Input / Field`                                      | `InputField.vue` (supports `v-model` and an `error` prop) |
| `Card / Championship`                                | `ChampionshipCard.vue`                                    |
| `Row / Fight`                                        | `FightRow.vue`                                            |
| `Competitor / Tile`                                  | `CompetitorTile.vue` (`side: 'A' \| 'B'` prop)            |
| `Metric / Overview`                                  | `OverviewMetric.vue`                                      |
| `Navigation / Public · App · Operator`               | `PublicNav.vue`, `AppNav.vue`, `OperatorNav.vue`          |

Figma variants become typed props (string-literal unions), not separate components.
Text properties become props or slots.

## Coding rules

- Multi-word component names (`AppButton`, not `Button`). `defineProps` with TS types.
- Scoped `<style>` in every component. Global CSS lives only in `src/styles/`.
- Rebuild Figma auto layout with flexbox/grid and `gap`. No absolute positioning unless Figma
  uses it, and no fixed widths on text containers.
- Interface text is **Portuguese (pt-BR)** exactly as in Figma. Code identifiers, file names,
  comments and commits are in English.
- Format dates and numbers with `Intl` using `pt-BR`.
- Pages use typed data from `src/mocks/` for now. Don't call the API or invent endpoints
  unless asked. Keep data loading in one place per view so it can be swapped for the API later.
- Don't add dependencies other than the `@fontsource` packages without asking.

## Accessibility and layout

- Use `<button>` for actions and `<RouterLink>`/`<a>` for navigation, with visible focus states.
- Lado A = blue, Lado B = pink, **always with a visible text label**. Never color alone.
- Red is only for destructive actions and errors. Orange is the primary action.
- Referee pages are designed at 390 × 844. Use touch targets of at least 48 px and no hover-only UI.
- Public and organizer pages are designed for desktop only; responsive layouts are still open.
  Keep them fluid (no horizontal scroll down to ~360 px), but don't invent mobile designs.

## Domain rules the UI must respect

- Match state (waiting, running, paused, finished) and recording/upload/analysis states
  (pendente, processando, concluído, falhou) are separate. Never merge them into one status.
- Referee screens show each referee's own values only. **Don't calculate or show an official
  total score** — the scoring formula is still undecided.
- Surrender reporting doesn't physically disable a robot. Keep the on-screen wording that says so.
- The operator can't start a fight until all three referees are connected.
- Fight order is manual. Don't build brackets, seeding or automatic advancement.
- There is no public self-registration on the sign-in page.
- Being signed in doesn't grant management access. Hide controls the user can't use, but
  assume the backend enforces permissions.

## Scaffold cleanup

The Vite starter files (`HelloWorld`, `TheWelcome`, `WelcomeItem`, `components/icons/Icon*`,
`stores/counter.ts`, `AboutView`, the green styles in `assets/`, and `HelloWorld.spec.ts`)
should be removed when the foundations are implemented. Remove them as part of that task,
not piecemeal.
