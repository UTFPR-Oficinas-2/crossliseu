# Crossliseu — Web frontend (`apps/web`)

Web app for the Crossliseu robot battle arena (UTFPR). Public viewers follow championships;
organizers manage them; an operator runs each fight; three referees score from their phones.

## Stack and commands

- Client-rendered SPA. The backend is NestJS in `apps/api`; live updates are planned (WebSockets) but not implemented.
- No Tailwind, no UI kit, no React. Styling is plain CSS with custom properties.

Before saying a task is done: run `type-check` and `lint`, and fix what they report.

## Figma source of truth

File: https://www.figma.com/design/kGzPxE42HygJmS0DEqQKwx (fileKey `kGzPxE42HygJmS0DEqQKwx`)

Pages: **README** (start here: index, domain rules, removed features, open questions),
**Foundations** (variables, text styles, components), **Público**, **Organizador**, **Operador**,
**Árbitro**, and **Arquivo · não implementar** (removed screens, never build them).
Names, dates and counts in the file are demo data.

- Each frame is one route in one state, named `<ID> <tela> · <estado>` (`OPE-03 Luta · em andamento`).
  Phone layouts (< 768 px) repeat the ID and end with `· celular`.
- Every frame has an **annotation** with its route, Vue view file, state, GitHub issues, milestone,
  data source and behaviour rules. If the picture and the annotation disagree, the annotation wins.
- Section names carry the milestone and issues (`Marco 3 · operar a luta com a arena (#37 #38)`).
  Build Marco 3 first, then Marco 4, then Final delivery.

### How to implement a Figma node

1. Work from the node link the user gives you (one frame or component at a time). If you only
   have the file link, call `get_metadata` with no node id to list the pages, then on the page
   to find the frame by its ID — don't pull a whole section.
2. Call `get_design_context` for the node and read its annotation first. Call `get_screenshot`
   when layout is unclear.
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

- `src/components/ui/` holds one design-system component per Figma component.
- Blocks used only inside one section live in `src/views/<section>/components/`.
- `src/data/` is the data access layer: it calls `src/api/` and maps payloads to `src/types`. There is no demo data.

### Figma component → Vue file

| Figma                                                | Vue (`src/components/ui/`)                                |
| ---------------------------------------------------- | --------------------------------------------------------- |
| `Button` (Variant = Primary · Secondary · Ghost · Destructive) | `AppButton.vue` (`variant` prop)                |
| `Status / Pill` (Tone = Neutral · Accent · Info · Success · Warning · Danger) | `StatusPill.vue` (`tone` prop)   |
| `Tab / Item`                                         | `TabItem.vue` (`active` prop)                             |
| `Sidebar / Item`                                     | `SidebarItem.vue` (`active` prop)                         |
| `Input / Field` (State = Default · Focus · Error · Disabled) | `InputField.vue` (`v-model`, `error`, `disabled`)  |
| `Select / Menu` · `Select / Option`                  | `SelectField.vue` (`v-model`, `options`, `error` prop)    |
| `Choice / Item` (State = Default · Selected · Disabled) | `ChoiceItem.vue` (new; radio card for arena and fight pickers) |
| `Card / Championship`                                | `ChampionshipCard.vue`                                    |
| `Row / Fight` (`hasAction`)                          | `FightRow.vue`                                            |
| `Competitor / Tile` (Side = A · B)                   | `CompetitorTile.vue` (`side: 'A' \| 'B'` prop)            |
| `Camera / Preview` (`recording`)                     | `CameraPreview.vue` (`stream`, `caption`, `signal`, `recording`, `elapsed`) |
| `Navigation / Public · App · Operator`               | `PublicNav.vue`, `AppNav.vue`, `OperatorNav.vue`          |
| `Navigation / Mobile` · `Navigation / Operator · Mobile` | Same nav components below 768 px                      |

Figma variants become typed props (string-literal unions) using the variant value in lowercase
(`Tone=Warning` → `tone="warning"`), not separate components. Text properties become props or
slots. Each component's Figma description repeats its Vue file and props.

## Coding rules

- Multi-word component names (`AppButton`, not `Button`). `defineProps` with TS types.
- Scoped `<style>` in every component. Global CSS lives only in `src/styles/`.
- Rebuild Figma auto layout with flexbox/grid and `gap`. No absolute positioning unless Figma
  uses it, and no fixed widths on text containers.
- Interface text is **Portuguese (pt-BR)** exactly as in Figma. Code identifiers, file names,
  comments and commits are in English.
- Format dates and numbers with `Intl` using `pt-BR`.
- Every page gets its data from the API through `src/data/` (which uses `src/api/`). No mocks, no
  demo data, no build-mode gates: what runs locally is what ships. Where `apps/api` has no
  endpoint yet (such as referee access) the `src/data/` function rejects with
  `not_implemented`; don't invent endpoints unless asked. Keep data loading in one place per view.
- Don't add dependencies other than the `@fontsource` packages without asking.

## Fight recording (operator)

- `FightRecorderPanel` follows the fight through its `fightPhase` prop (`before | running | ended`):
  camera preview only before, automatic recording while running, send / optional download after.
  There are no manual record or stop buttons.
- Recording is **optional**, like the ESP32 connection: no camera must never block starting or
  ending a fight.
- `MatchOperationView` maps the operator snapshot to `fightPhase`: `scheduled` -> `before`,
  `ongoing | paused` -> `running`, `finished` -> `ended`.

## Accessibility and layout

- Use `<button>` for actions and `<RouterLink>`/`<a>` for navigation, with visible focus states.
- Lado A = blue, Lado B = pink, **always with a visible text label**. Never color alone.
- Red is only for destructive actions, errors, and a disconnected arena (`Status / Pill` Danger,
  as in `OperatorNav` and the OPE-01 picker). Orange is the primary action.
- Referee pages are designed at 390 × 844. Use touch targets of at least 48 px and no hover-only UI.
- Use desktop (1440) and phone (390, `· celular`) frames where available. The operator fight
  frames are desktop-only. Switch layouts at 768 px and keep everything fluid down to ~360 px.

## Domain rules the UI must respect

- Match states and weight classes are the API's values (`scheduled | ongoing | paused | finished`;
  weight classes untranslated, e.g. `beetleweight`). Championship status is
  `scheduled | ongoing | closed`.
- Match state and recording/upload/analysis states (pendente, processando, concluído, falhou)
  are separate. Never merge them into one status.
- Every screen shows only the total points per competitor (sum of the 3 referees). Never show a
  single referee's partial.
- The server owns the fight (status, timer, end reason). Nothing is blocked by an offline arena
  or by referees who aren't connected: show the status, never disable Start because of it.
- Surrender only comes from the arena box buttons and only counts while the fight is running.
  The web app has no surrender buttons; the operator ends the fight (`manual`) and can
  correct the reason before closing it (#57).
- `endReason` labels: `time_out` = TEMPO ESGOTADO, `manual` = ENCERRADA PELO OPERADOR,
  `surrender` = DESISTÊNCIA DO LADO A / B (the side opposite `winnerRobotId`);
  `winnerRobotId: null` = EMPATE.
- Arenas are global (not per championship), one ESP32 box each.
- Referees join with their own link, without an account. No "ready" step and no correction window.
  Scoring is +1 / −1 per side, nothing else.
- A fight can end in a draw (EMPATE). The public sees scheduled fights as well as results.
- Robô 1 / Robô 2 have no side when the fight is created; the operator assigns Lado A / Lado B
  before Start. Fight order is manual.
  Don't build brackets, seeding or automatic advancement.
- There is no public self-registration on the sign-in page.
- Being signed in doesn't grant management access. Hide controls the user can't use, but
  assume the backend enforces permissions.
