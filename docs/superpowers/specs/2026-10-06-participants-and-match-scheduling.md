# Championship management: what's left (participants + match scheduling)

## Context

Figma section `Organizador · gestão do campeonato` (node 27:581) has 7 frames. Scope agreed for this report:

| Frame | Screen | Status |
|---|---|---|
| 06 (20:240) | Meus campeonatos | ✅ done (API-backed) |
| 08 (20:302) | Criar / editar campeonato | ✅ done (API-backed) |
| 07 (2:15) | Visão geral | ⏸ out of scope (stays a placeholder) |
| **09 (22:336)** | Participantes (list) | ❌ placeholder: [ParticipantsView.vue](apps/web/src/views/organizer/ParticipantsView.vue) |
| **09b (120:493)** | Adicionar / editar participante | ❌ no route or view |
| **10 (22:496)** | Lutas (list) | ❌ placeholder: [MatchesView.vue](apps/web/src/views/organizer/MatchesView.vue) |
| **10b (126:530)** | Nova / editar luta | ❌ no route or view |

Running matches (preparing, operating, "Em combate", "Aguardando preparação") is out of scope. Scheduling means creating, editing and deleting `waiting` matches.

Decisions made:
- **Robot fields:** build only name, team and weight class (what the API and form 09b have). Drop the Aptos/Pendentes tabs, the combat category (Arrasto/Girante…) and "responsável" from the UI.
- **Matches:** create, edit and delete, allowed only while `status === 'waiting'`.
- **Overview (07):** skip.

---

## Part 1 — Backend (`apps/api`)

### What exists
- Robots: full CRUD at [robots.controller.ts](apps/api/src/modules/robots/robots.controller.ts). `GET /robots?championshipId=` works; create checks that the championship exists.
- Matches: `POST /matches` checks that both robots differ, exist and belong to the championship ([matches.service.ts](apps/api/src/modules/matches/matches.service.ts), tested in `matches.service.spec.ts`). `GET /matches` returns **every** match. `PATCH` and `DELETE` are empty stubs (`updateMatchDto: any`).

### 1.1 Robots: rules from Figma 09b that the API doesn't enforce yet
1. **Unique name per championship** ("O nome do robô não pode se repetir dentro do mesmo campeonato"). In `RobotsService.create`/`update`, compare trimmed, case-insensitive names against the championship's robots and throw `ConflictException('robot_name_taken')`. Add a migration with a partial unique index as a backstop: `(championship_id, lower(name)) WHERE deleted_at IS NULL`.
2. **Don't orphan matches.** `remove` soft-deletes a robot, so its matches keep pointing at a deleted row. Block it with `ConflictException('robot_has_matches')` when the robot is `robot_a_id`/`robot_b_id` of any match that isn't deleted. Also reject a `weightClass` change in that case, because it would break the same-class rule below.
   - Avoid a circular module import (`MatchesModule` already imports `RobotsModule`). Do the check in `RobotsRepository` with a query on the `Match` entity, the same way [championships.repository.ts](apps/api/src/modules/championships/championships.repository.ts) `countRobotsAndMatches` joins `Robot`/`Match` without importing their modules.
3. Normalize `name`, `team` and `weightClass` (trim, collapse spaces) in the DTOs with `@Transform`. Otherwise `"3 kg"` and `"3kg "` count as different weight classes.
4. `findAll`: add `order: { createdAt: 'ASC' }` so the list order is stable.
5. Add `robots.service.spec.ts`, following the mock-repo `setup()` pattern in `matches.service.spec.ts`.

### 1.2 Matches: list per championship, edit, delete
1. **`GET /matches?championshipId=`**: copy the robots controller (`@Query('championshipId', new ParseUUIDPipe({ optional: true }))`). In the repository, return `relations: { robotA: true, robotB: true }` and `order: { createdAt: 'ASC' }` so the list can show names without extra requests. The order is creation order: Figma says "montadas manualmente, sem chaveamento automático", and reordering isn't in the designs.
2. **Same weight class** ("Dois robôs diferentes… da mesma categoria de peso"). In `create`, derive `weightClass` from the robots instead of trusting the client: remove it from `CreateMatchDto` and throw `BadRequestException('match_weight_class_mismatch')` when the two robots differ. Move the robot checks into a private `resolveRobots(championshipId, robotAId, robotBId)` that returns the shared weight class, so `update` can reuse it.
3. **`PATCH /matches/:id`**: `UpdateMatchDto = PartialType(PickType(CreateMatchDto, ['robotAId', 'robotBId']))`. Load the match, throw `ConflictException('match_not_editable')` unless `status === 'waiting'`, merge the ids, run `resolveRobots` with the match's `championshipId`, then save `robotAId`, `robotBId` and `weightClass`.
4. **`DELETE /matches/:id`**: `@HttpCode(204)`. Same `waiting` guard, then `matchesRepository.remove` (soft delete). Championship counts already leave out soft-deleted matches.
5. Extend `matches.service.spec.ts`: weight-class mismatch, update happy path and guard, delete guard.

No new migration is needed for matches (`weight_class` stays as a denormalized column).

---

## Part 2 — Frontend foundation (`apps/web`)

Follow the existing championship pattern: `src/api/*.ts` mirrors the API shapes, `src/mocks/index.ts` maps them to `@/types` and has a demo-mode branch, and views call only `@/mocks`.

1. **`src/api/robots.ts`, `src/api/matches.ts`**: copy [api/championships.ts](apps/web/src/api/championships.ts). They need `ApiRobot`, `ApiMatch` (with optional `robotA`/`robotB`), create/update payloads, and list/create/update/delete functions that take a `token`.
2. **Types** ([types/index.ts](apps/web/src/types/index.ts)):
   - `Robot`: make `owner`, `category` and `status` optional (demo data keeps them; the UI no longer reads them).
   - Split `Match`: add `MatchSummary` = `{ id, championshipId, weightClass, robotAId, robotBId, state, createdAt, modifiedAt }`, then `interface Match extends MatchSummary { …operator fields }`. Organizer screens use `MatchSummary`, and operator/referee code keeps working unchanged.
3. **Data layer** ([mocks/index.ts](apps/web/src/mocks/index.ts)):
   - `getRobots(championshipId)` and a new `getMatchSummaries(championshipId)`: API branch with `toRobot`/`toMatchSummary` (map API `status` → `state`), demo branch as today. Leave `getMatches`/`getMatch` alone; `OperatorLayout` depends on the full `Match`.
   - Add `createRobot`, `updateRobot`, `deleteRobot`, `createMatch`, `updateMatch`, `deleteMatch`. Their demo branches mirror the server rules with the same error codes, the way `assertDemoDateRange` does (`robot_name_taken`, `robot_has_matches`, `match_robots_must_differ`, `match_weight_class_mismatch`, `match_not_editable`).
4. **`src/utils/match.ts`**: `matchStatePill: Record<MatchState, {label, tone}>`, modeled on `championshipStatusPill` in [utils/championship.ts](apps/web/src/utils/championship.ts). `waiting` → "Programada" (`info`), `running`/`paused` → "Em andamento" (`accent`), `finished` → "Encerrada" (`success`). Add a matching unit test.
5. **Routes** ([router/index.ts](apps/web/src/router/index.ts), inside `/manage` children):
   - `:championshipId/participants/new` → `participant-create`, and `:championshipId/participants/:robotId/edit` → `participant-edit`, both on `ParticipantFormView` with a `mode` prop.
   - `:championshipId/matches/new` → `match-create`, and `:championshipId/matches/:matchId/edit` → `match-edit`, both on `MatchFormView`.
   - **Sidebar highlight:** [OrganizerLayout.vue](apps/web/src/layouts/OrganizerLayout.vue) uses `route.name === item.routeName`, so sub-pages don't highlight "Participantes"/"Lutas". Add `meta: { sidebar: 'championship-participants' | 'championship-matches' }` to the child routes, extend the `RouteMeta` declaration, and compare `route.meta.sidebar ?? route.name`.

---

## Part 3 — Screens (one per step, in this order)

Per [apps/web/CLAUDE.md](apps/web/CLAUDE.md): `get_design_context` per node, translate to a Vue SFC with scoped CSS and tokens, reuse `components/ui`, and no hover styles (your saved preference). Pull business logic into a sibling `*.ts` file with unit tests, the way [championship-form.ts](apps/web/src/views/organizer/championship-form.ts) does.

### 3.1 Participantes — 09 (22:336) → `ParticipantsView.vue`
- Breadcrumb, title, and "Adicionar participante" (`AppButton :to` `participant-create`).
- Subtitle: "N robôs inscritos · M equipes" (count distinct teams).
- Toolbar: `InputField type="search"` filters by robot or team; placeholder "Buscar robô ou equipe". **No tabs.**
- Table columns Robô / Equipe / Categoria, where Categoria shows only `weightClass`. Row actions: "Editar" (secondary, link) and "Remover" (destructive) with `window.confirm`. On `robot_has_matches`, show an inline message ("Este robô está em lutas programadas…").
- Empty state (22:487): no search results → "Limpar busca". Zero robots → copy that points to "Adicionar participante".
- Loading and error states like `MyChampionshipsView` (`loadState` + retry). Keep the footer.

### 3.2 Adicionar/editar participante — 09b (120:493) → `ParticipantFormView.vue` + `participant-form.ts`
- Copy `ChampionshipFormView` almost line for line: `values`, `touched`, client errors, API field errors, `describeSaveError`, a dirty check with `onBeforeRouteLeave`, and `isUnmounted` guards.
- Fields: Nome do robô * (hint "Aparece nas lutas…"), Equipe *, Categoria de peso * (hint "Uma luta só reúne robôs da mesma categoria."). Map `robot_name_taken` to the name field.
- Actions: Cancelar → participants. In create mode, also "Salvar e adicionar outro" (ghost: save, reset the form, focus the name field) and "Adicionar participante" (save, go to the list). In edit mode, use a single "Salvar alterações" button.
- Aside: "Prévia na luta" with `CompetitorTile side="A"` (team, robot, details `Peso {weightClass}`) updating live from `values`, plus the "Campos obrigatórios" card.
- Edit mode loads the robot with `getRobots(championshipId)` and finds it by `robotId`, with a not-found state. On `robot_has_matches`, show the weight-class error.

### 3.3 New UI component — `Select / Menu` + `Select / Option` (126:663, 126:666) → `components/ui/SelectField.vue`
Build this as its own step before 10b; the design system doesn't have it yet. Spec from the screenshot:
- The trigger looks like `InputField` with a chevron; orange border when open.
- The menu has an overline group label ("Participantes · 3 kg") and options with the name on the left and a muted meta on the right. The selected option gets the orange-dim background and a check. A disabled option dims its meta text ("Já escolhido como Robô 1").
- Props: `label`, `options: { value, label, meta?, disabled?, disabledReason? }[]`, `groupLabel?`, `hint?`, `error?`, `v-model`.
- Accessibility: WAI-ARIA combobox/listbox (`aria-expanded`, `aria-activedescendant`, arrow keys, Enter, Esc, closes on outside click). No hover styles: use `aria-selected` and an active-descendant style instead.
- Add it to `ComponentsPreviewView` and the Figma→Vue table in CLAUDE.md.

### 3.4 Lutas — 10 (22:496) → `MatchesView.vue`
- Title, "Criar luta" (→ `match-create`), and subtitle "N lutas · montadas manualmente, sem chaveamento automático."
- Tabs Todas / Programadas / Em andamento / Encerradas, kept in `?state=` like `MyChampionshipsView`'s `?status=`. "Em andamento" includes running and paused.
- Table Confronto / Status: "ROBÔ A × ROBÔ B" (finished rows can stay plain "A × B" for now; "A venceu B" needs result data that doesn't exist yet). Use `StatusPill` from `matchStatePill`.
- Actions: only `waiting` rows get "Editar" (→ `match-edit`). Leave out "Abrir operação", "Preparar" and "Ver detalhes" (running flow).
- Empty state per tab.

### 3.5 Nova/editar luta — 10b (126:530) → `MatchFormView.vue` + `match-form.ts`
- Loads `getRobots` and, in edit mode, `getMatchSummaries` (find by `matchId`; not-found and not-`waiting` states).
- Two `SelectField`s (Robô 1 × Robô 2). Put the logic in `match-form.ts` and unit test it:
  - Once either robot is picked, the other list shows only robots of the same `weightClass`, and the picked robot appears disabled with "Já escolhido como Robô N". The group label is "Participantes · {weightClass}".
  - If Robô 1 changes to a different class, clear Robô 2.
  - Hint under each picker: "{team} · {weightClass}".
  - Map API errors: `match_robots_must_differ` and `match_weight_class_mismatch` → robot B field; `robot_not_in_championship` and `match_not_editable` → banner.
- Fewer than 2 robots in the championship: show a message and a link to "Adicionar participante" instead of the form.
- Actions: Cancelar plus "Criar luta" / "Salvar luta". In edit mode, add "Excluir luta" (destructive, confirm) at the start of the action row. Figma 10 has no delete button, so the form is the place for it.
- Aside: "Prévia na lista" (names × names, "Equipe A × Equipe B · 3 kg", `StatusPill` "Programada" info) plus the "Regras do confronto" card, with its copy unchanged.

---

## Suggested PR sequence
1. API robots rules (1.1) + tests.
2. API matches list/update/delete + weight-class rule (1.2) + tests.
3. Web foundation (Part 2): api modules, types, data layer, `utils/match.ts`, routes, sidebar meta.
4. 09 + 09b.
5. `SelectField` component.
6. 10 + 10b.

## Open issues (outside this scope, but they'll bite)
- `/manage` is registered **only in dev** (`devRoutes`). Production can't reach any organizer page, even the API-backed ones. Moving it out also means dealing with `championship-overview` (placeholder, and the redirect target after creating a championship) and "Ver página pública" (the `championship` route is dev-only too).
- The API has no roles or ownership: any authenticated user can edit any championship, robot or match.
- `RobotStatus`, owner and category stay in the demo data and types as optional fields. Remove them later if the product drops them for good.

## Verification
- `apps/api`: `npm test` (vitest: robots + matches service specs), `npm run lint`, `npm run build`.
- `apps/web`: `npm run type-check`, `npm run lint`, `npm run test:unit` (new `match-form`, `participant-form` and `utils/match` specs).
- End to end: `docker compose up` (API + Postgres), run migrations, start web with `VITE_API_URL=/api`, sign in, then:
  1. Create a championship.
  2. Add 3 robots (two at 3 kg, one at 1 kg). A duplicate name shows the name error, and "Salvar e adicionar outro" resets the form.
  3. In Nova luta, picking a 3 kg robot hides the 1 kg one and disables the picked one. Create the match and see it under Programadas.
  4. Edit it to swap a robot, then delete it.
  5. Removing a robot that's in a match shows the conflict message.
  6. Repeat with `VITE_API_URL` unset to check that demo mode behaves the same.
