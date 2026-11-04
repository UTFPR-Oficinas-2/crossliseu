# Kickstart Sprint: API Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: implement inline with superpowers:executing-plans, one task at a time in this worktree, each task via superpowers:test-driven-development; finish with superpowers:verification-before-completion. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the problems a review of `main` found in the users, matches, robots, championships and auth code, and add the tests that prove the fixes, before work starts on any GitHub issue.

**Architecture:** Services keep the rules and repositories keep the SQL. Every write that depends on a check either becomes one conditional `UPDATE … WHERE …` or runs in a transaction that locks the parent row. A new opt-in DB test suite runs against a throwaway Postgres database and covers what mocks can't: the races, the guards, the `ValidationPipe`, login, and migrations on a fresh database.

**Tech Stack:** NestJS 12, TypeORM 1.1 on Postgres 18, class-validator, Vitest 4, supertest, oxlint, Prettier.

**Spec:** this plan is the spec: the user's brief plus the decisions recorded below.

**Worktree:** `/Users/ediasv/Code/crossliseu/.worktrees/chore/kickstart-sprint`, branch `chore/kickstart-sprint`. Run API commands from `apps/api`.

**Git rule (user):** never commit or push. Each task ends with a "stop and report" step in place of a commit.

## Scope

- **In:** the users, matches (race and response shape only), championships, robots and auth findings below, plus the tests they need, a login e2e test, and the DB test harness.
- **Out:** GitHub #17 (state machine, timer, commands, end reasons), #33, #19, #35. Don't touch `apps/web` or `firmware`. No login rate limit.

## Verdicts on the review findings

| # | Finding | Verdict | Where |
|---|---|---|---|
| U1 | `UsersService.findAll/findOneById/update/delete` are TODO stubs returning strings | Confirmed | `users.service.ts:13-21, 34-42`; routes `users.controller.ts:20-41` |
| U2 | DTOs use `name`/`email`; entity has `username`/`email`/`password` | Confirmed | `dto/create-user.dto.ts:6,10`; `entities/user.entity.ts:6-13` |
| U3 | `UsersRepository.update` typed `Partial<Match>` | Confirmed | `users.repository.ts:5,30` |
| U4 | `users.username` not unique, but login and the seed look users up by it | Confirmed | `user.entity.ts:6`; `1789914366979-CreateUsers.ts:8`; `users.repository.ts:26-28`; `seeds/create-admin.seed.ts:22` |
| M1 | Matches are scheduling CRUD only; nothing leaves `waiting` | Confirmed (`match.entity.ts:7,28`). **Out of scope** (#17) | |
| M2 | `update`/`remove` check `waiting` and then write in a second query | Confirmed. Today it races with a concurrent DELETE/PATCH and with manual state changes, and it will race with Start in #17 | `matches.service.ts:62-87` (`assertEditable` 90-98) |
| M3 | `GET /matches` loads robots, `GET /matches/:id` and `update` do not | Confirmed; `create` doesn't load them either | `matches.repository.ts:17-29`; `matches.service.ts:44,80` |
| C1 | `ChampionshipsService.remove` soft-deletes with no check | Confirmed | `championships.service.ts:72-75` |
| C2 | `RobotsService` check-then-write race | Confirmed (update with a weight change, and remove) | `robots.service.ts:69-79, 84-88` |
| C3 | Coverage uneven; no auth/users/controller/e2e tests | Confirmed by file count (specs only for the matches/robots services, the robot DTO, entities and one migration). Percentages re-measured in Task 0 | `src/**/*.spec.ts` |
| L1 | `validateUser` returns before `bcrypt.compare` for an unknown user | Confirmed | `auth.service.ts:19-26` |
| L2 | No rate limit on `/auth/login` | Confirmed. **Not fixed** (user decision) | `auth.controller.ts:19-25` |
| L3 | 404s and failed logins logged at `error`, with the typed username | Confirmed; the code `UserNotFound` is also not snake_case | `users.service.ts:27-28`; `*_not_found` in each service |
| L4 | `lint` references a missing `test/` folder | Confirmed (`format` too) | `package.json:11,16` |

Found while verifying:
- The worktree has no root `.env`, and `src/config/env.ts` loads `../../.env`, so nothing runs until it is copied (Task 0).
- `ValidationPipe` is set up only in `main.ts`, so a Nest testing module never gets it. Task 1 moves it into a shared `configureApp`.
- `/auth/login` reads `@Req()`, not a `LoginDto` body. `LocalAuthGuard` runs first, so a missing field returns **401**, not 400.
- `JwtStrategy.validate` (`jwt.strategy.ts:16-18`) doesn't check that the user still exists. This is harmless once `DELETE /users` is gone; see Risks.
- `repository.update()` in TypeORM does **not** filter soft-deleted rows. Every conditional write below adds `deletedAt: IsNull()`.

## Decisions (from the user, 2026-11-04)

1. **Users routes:** remove `UsersController` and its DTOs; keep only what login needs.
2. **Championship delete:** cascade the soft delete to its matches and robots in one transaction, and refuse with **409 `championship_has_live_match`** while any match is `running` or `paused`. No code sets those states until #17, but the check is cheap and will protect #17's fights.
3. **DB tests:** opt-in `npm run test:db` against a throwaway `POSTGRES_TEST_DB`. `npm test` stays database-free.
4. **Lower priority:** do the login timing fix, the log levels and the lint/format scripts. Skip the rate limit.
5. **#17 is out.** The fight duration and the `/arena` state shape (asked earlier) are deferred to it.

## Calls I made (flag them if they look wrong)

- **Username uniqueness is exact-case**, because login matches exactly. It is a partial unique index `WHERE deleted_at IS NULL`, the same pattern as the robot-name index.
- **Log levels:** every `*_not_found` and failed login goes to `warn`, and the username is never logged. 400s and 409s stay at `error`.
- **Lock order** everywhere: championship, then robots (sorted by id), then the match.
- **No new dependencies.**

## Global Constraints

- ESM imports end in `.js`; `apps/api` Prettier config (single quotes, trailing commas, 4-space indent). Run `npx prettier --write <files>` on every touched file.
- Errors are Nest exceptions with snake_case codes, each preceded by `this.logger.error(code, context)`; `*_not_found` and login failures use `this.logger.warn`.
- New error code (exact): `championship_has_live_match` 409. Existing codes and statuses are unchanged.
- One migration: `1791600000000-UsersUniqueUsername`.

## Review Focus

1. **PATCH and DELETE on the same match at once**, or a PATCH landing after a DELETE: the deleted match is never edited back to life; the PATCH gets 404. Pinned in Task 4.
2. **A robot's weight class changes while a match with it is being created** (or the reverse): one side fails with 409/400, and no match pairs two weight classes. Pinned in Task 5.
3. **A robot or match created while its championship is being deleted:** it fails with 404, and nothing is orphaned. Pinned in Task 6.
4. **An existing database with duplicate usernames:** the migration stops with a message naming them, instead of a raw Postgres error halfway through. Pinned in Task 3.
5. **Unknown username vs wrong password:** the same status and body, and both run one bcrypt compare. Pinned in Task 2 (unit) and Task 1 (e2e).

## File map (`apps/api`)

- Test infra (new): `vitest.db.config.ts`, `test/global-setup.ts`, `test/setup-env.ts`, `test/helpers.ts`, `test/*.db-spec.ts`; `src/app.setup.ts` (new), `src/main.ts`; `package.json` (`test:db`); root `.env.example` (`POSTGRES_TEST_DB`).
- Auth/users: `modules/auth/auth.service.ts` (+ new spec), `modules/users/users.service.ts` (+ new spec), `users.repository.ts`, `users.module.ts`, `entities/user.entity.ts`; delete `users.controller.ts` and `users/dto/`.
- Matches: `matches.repository.ts`, `matches.service.ts` (+ spec).
- Robots: `robots.repository.ts`, `robots.service.ts` (+ spec).
- Championships: `championships.repository.ts`, `championships.service.ts`, new `championships.service.spec.ts`.
- Migration: `src/database/migrations/1791600000000-UsersUniqueUsername.ts`, `src/database/users-username-migration.spec.ts`.

---

## Task 0: Workspace and baseline (no product code)

- [ ] **Step 1:** Copy this plan to `.claude/plans/2026-11-04-kickstart-sprint-api-hardening.md` in the worktree root (user rule: implementation plans live in the hidden `.claude` directory, not `docs/superpowers/plans/`). The folder is new and not git-ignored; it isn't committed (no commits on this branch).
- [ ] **Step 2:** `cp /Users/ediasv/Code/crossliseu/.env <worktree>/.env` (git-ignored; check with `git check-ignore .env`) and add `POSTGRES_TEST_DB=crossliseu_test`.
- [ ] **Step 3:** `cd apps/api && npm ci`.
- [ ] **Step 4:** Record the baseline output of `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run test:cov` (the real coverage for C3). Note whether lint fails on the missing `test/`.
- [ ] **Step 5:** `docker compose up -d postgres` from the worktree root. Stop and report the baseline.

## Task 1: DB test harness, `configureApp`, login and guard e2e, migrations on a fresh DB

**Files:** Create `src/app.setup.ts`, `vitest.db.config.ts`, `test/global-setup.ts`, `test/setup-env.ts`, `test/helpers.ts`, `test/auth.e2e.db-spec.ts`, `test/migrations.db-spec.ts`. Modify `src/main.ts`, `package.json`, root `.env.example`.

**Interfaces (produced):**
- `configureApp(app: INestApplication): void` holds the `ValidationPipe` from `main.ts:9-15`. Swagger stays in `main.ts`.
- `test/helpers.ts`:
  - `createTestApp(): Promise<INestApplication>`: AppModule + `configureApp` + `init`.
  - `resetDatabase(ds: DataSource): Promise<void>`: `TRUNCATE users, matches, robots, championships CASCADE`.
  - `createUser(ds, username, password): Promise<User>`: bcrypt cost 4.
  - `loginToken(app, username, password): Promise<string>`.
  - `seedChampionship(ds)`, `seedRobot(ds, championshipId, { name, weightClass })`, `seedMatch(ds, championshipId, robotAId, robotBId)`: direct inserts.
- `npm run test:db` runs `vitest run --config vitest.db.config.ts`, which sets `include: ['test/**/*.db-spec.ts']`, `fileParallelism: false`, `setupFiles: ['test/setup-env.ts']` and `globalSetup: 'test/global-setup.ts'`. The default config's `*.spec.ts` pattern does not match `*.db-spec.ts`.
- `setup-env.ts` imports `src/config/env.js`, then sets `process.env.POSTGRES_DB = process.env.POSTGRES_TEST_DB`. It must run before `AppModule` is imported, because `TypeOrmModule.forRoot(databaseOptions())` reads the env at import time.
- `global-setup.ts` throws `POSTGRES_TEST_DB must be set and differ from POSTGRES_DB` when it is missing or equal. It connects to the `postgres` database, runs `DROP DATABASE IF EXISTS` / `CREATE DATABASE` on the test DB, then runs all migrations (`databaseOptions()` with `database` overridden).

- [ ] **Step 1: Write the failing tests.**
  - `auth.e2e.db-spec.ts`:
    - `POST /auth/login` with the right password → 201 `{ token: <string> }`.
    - Wrong password → 401; unknown username → 401 with the same body.
    - Missing `password` → 401.
    - `GET /championships` with no token → 200 (`@Public`); `POST /championships` with no token → 401.
    - With a token, `{ name: 'X', startDate: 'nope', endDate: '2026-11-04' }` → 400 (ValidationPipe active); an extra field `foo` → 400 (`forbidNonWhitelisted`).
    - A forged token signed with another secret → 401.
  - `migrations.db-spec.ts`: undo every migration until none are left (only the `migrations` table remains), then `runMigrations()` re-applies them all, and the count equals the number of files in `src/database/migrations`.
- [ ] **Step 2:** `npm run test:db`. Expect failures (no script, no `configureApp`).
- [ ] **Step 3:** Implement the files above and switch `main.ts` to `configureApp(app)`. Add `POSTGRES_TEST_DB=` with a comment to `.env.example`.
- [ ] **Step 4:** `npm run test:db` passes, `npm test` still passes, and `npm run lint` now finds `test/` (L4 fixed; the scripts need no edit). Stop and report.

## Task 2: Login timing and log levels (L1, L3)

**Files:** `modules/auth/auth.service.ts`, new `auth.service.spec.ts`, `modules/users/users.service.ts`, new `users.service.spec.ts`, and the `*_not_found` logs in `championships.service.ts:51`, `matches.service.ts:55`, `robots.service.ts:51` (and their specs, if they assert on `logger.error`).

**Interfaces:**
- `UsersService.findByUsername(username: string): Promise<User | null>` (no throw, no log).
- `AuthService.validateUser` always runs exactly one `bcrypt.compare`: against the user's hash, or against a module-level `DUMMY_HASH` (a real bcrypt hash with cost 10, made once at load) when the user is unknown.
- On failure it calls `this.logger.warn('login_failed')` with no context.

- [ ] **Step 1: Failing tests** (`auth.service.spec.ts`, `bcrypt` mocked with `vi.mock`):
  - Unknown user → `null`, and `compare` was called once with `DUMMY_HASH`.
  - Wrong password → `null`.
  - Right password → the user without `password`.
  - The logger spy's arguments never contain the username.
  - `users.service.spec.ts`: unknown user → `null`.
- [ ] **Step 2:** `npx vitest run src/modules/auth src/modules/users`. Expect FAIL.
- [ ] **Step 3:** Implement, and switch the three `*_not_found` logs to `logger.warn`.
- [ ] **Step 4:** `npm test && npm run test:db`. Stop and report.

## Task 3: Remove the users routes, unique username (U1–U4)

**Files:**
- Delete `users.controller.ts` and `users/dto/`.
- Modify `users.module.ts` (no controller), `users.repository.ts` (keep only `findOneByUsername`; drop the `Match` import), `users.service.ts` (keep only `findByUsername`) and `entities/user.entity.ts` (add `@Index('UQ_users_username', { synchronize: false })` with a comment like the one in `robot.entity.ts:6-9`).
- Create `migrations/1791600000000-UsersUniqueUsername.ts` and `src/database/users-username-migration.spec.ts`.
- Extend `test/auth.e2e.db-spec.ts`.

**Migration `UsersUniqueUsername1791600000000`:**
- `up` checks for live duplicates: `SELECT "username" FROM "users" WHERE "deleted_at" IS NULL GROUP BY 1 HAVING COUNT(*) > 1`. If any come back, it throws `Rename users with duplicate usernames before running this migration: <json>`.
- It then runs `CREATE UNIQUE INDEX "UQ_users_username" ON "users" ("username") WHERE "deleted_at" IS NULL`.
- `down` drops the index. The rollback is lossless.

- [ ] **Step 1: Failing tests.**
  - Migration spec (fake `QueryRunner`, like `robot-name-migration.spec.ts`): it throws when the duplicate query returns rows, and otherwise creates the index with the partial `WHERE`.
  - e2e: `GET /users` with a token → 404.
  - e2e: a second live user with the same username → `QueryFailedError` code `23505`; after soft-deleting the first, the insert succeeds.
- [ ] **Step 2:** Run both. Expect FAIL.
- [ ] **Step 3:** Implement. The seed needs no change: `findOneBy` already skips soft-deleted rows.
- [ ] **Step 4:** `npm test`, `npm run test:db` (the round-trip now includes this migration), `npx tsc --noEmit`, then on the dev DB `npm run migration:run` and `npm run seed:admin` twice (first "Created", then "Updated"). Stop and report.

## Task 4: Match response shape and conditional edit/delete (M2, M3)

**Files:** `matches.repository.ts`, `matches.service.ts`, `matches.service.spec.ts`, new `test/matches.db-spec.ts`.

**Interfaces (produced, used by Tasks 5 and 6):**
- `MatchesRepository.findOne(id)` loads `{ robotA: true, robotB: true }`. `findAll` is unchanged.
- `MatchesRepository.updateIf(id: string, expected: FindOptionsWhere<Match>, patch: QueryDeepPartialEntity<Match>): Promise<boolean>`: one `UPDATE … WHERE id AND deleted_at IS NULL AND <expected>`, returning `affected === 1`. It is built on a private `conditionalUpdate(manager: EntityManager, …)` so Task 5 can run it inside a transaction.
- `MatchesRepository.softDeleteIf(id: string, expected: FindOptionsWhere<Match>): Promise<boolean>`.
- `MatchesService.update` writes with `updateIf(id, { status: 'waiting' }, …)` and `remove` with `softDeleteIf(id, { status: 'waiting' })`. On `false`, the service re-reads: missing → 404 `match_not_found`, otherwise → 409 `match_not_editable`. `create` and `update` return `this.findOne(id)`, so the robots are always loaded.

- [ ] **Step 1: Failing tests.**
  - Unit: `update` when `updateIf` resolves `false` and the re-read shows `running` → 409 `match_not_editable`.
  - Unit: the same with the re-read returning `null` → 404 `match_not_found`.
  - Unit: the same two cases for `remove` / `softDeleteIf`.
  - Unit: `create` returns a match with `robotA.name`/`robotB.name` set.
  - DB: `GET /matches/:id` and the `PATCH` response include `robotA`/`robotB`.
  - DB: after `UPDATE matches SET state='running'`, a `PATCH` → 409 and the row is unchanged.
  - DB: `DELETE`, then `PATCH` → 404, and `deleted_at` stays set (Review Focus 1).
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement. `assertEditable` stays as the fast path before the robot checks.
- [ ] **Step 4:** `npm test && npm run test:db`. Stop and report.

## Task 5: Robot / match race (C2)

**Files:** `robots.repository.ts`, `robots.service.ts`, `robots.service.spec.ts`, `matches.repository.ts`, `matches.service.ts`, `matches.service.spec.ts`, new `test/robot-races.db-spec.ts`.

**Approach:** lock the robot row on both sides inside transactions.
- The robot write takes `FOR UPDATE` and then checks for matches in a new statement, which gets a fresh snapshot under READ COMMITTED.
- The match write takes `FOR SHARE` on both robots, then validates and writes.
- Whichever side locks first wins; the other waits, then sees the committed result.

**Interfaces:**
- `type RobotWriteResult = 'done' | 'not_found' | 'has_matches'`.
- `RobotsRepository.update(id, patch: Partial<Robot>, opts: { requireNoMatches: boolean }): Promise<RobotWriteResult>` and `RobotsRepository.remove(id): Promise<RobotWriteResult>` (which always requires no matches). `hasMatches` is removed.
- `RobotsService` maps `'has_matches'` to 409 `robot_has_matches` and `'not_found'` to 404 `robot_not_found`, and keeps `rethrowNameTaken` around `update`. It passes `requireNoMatches` only when the weight class changes, as it does today.
- `MatchesRepository.createWithRobots(robotIds: [string, string], build: (robotA: Robot | null, robotB: Robot | null) => Match | Promise<Match>): Promise<Match>`.
- `MatchesRepository.updateWaitingWithRobots(id, robotIds, build: (robotA, robotB) => Partial<Match> | Promise<Partial<Match>>): Promise<boolean>`: `conditionalUpdate` with `{ status: 'waiting' }` on the transaction's manager.
- In both, `build` throws to abort the transaction.
- `MatchesService.resolveRobots` becomes synchronous: `pairRobots(championshipId: string, robotA: Robot | null, robotB: Robot | null): string`. A `null` robot → 404 `robot_not_found`; the championship and weight-class checks are unchanged. `match_robots_must_differ` is still checked before the transaction.

- [ ] **Step 1: Failing tests.**
  - Unit: `RobotsService.update` with a weight change and the repository returning `'has_matches'` → 409.
  - Unit: `remove` → 409 and 404 the same way.
  - Unit: `MatchesService.create` whose `build` gets a `null` robot → 404.
  - DB (a), match holds the lock first: call `matchesRepository.createWithRobots(ids, async () => { await gate.promise; return new Match(...) })` directly. While it is held, `robotsService.update(robotA, { weightClass: 'heavyweight' })` has not settled after 200 ms. `gate.resolve()`; the create resolves and the update rejects with `robot_has_matches`.
  - DB (b), robot holds the lock first: a raw `queryRunner` transaction runs `SELECT … FROM robots WHERE id = $1 FOR UPDATE` and updates its `weight_class`. `matchesService.create(...)` has not settled after 200 ms. Commit; the create rejects with `match_weight_class_mismatch`.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement with `repository.manager.transaction(...)` and `find({ where, lock: { mode: 'pessimistic_write' | 'pessimistic_read' } })`, robot ids sorted.
- [ ] **Step 4:** `npm test && npm run test:db`. Stop and report.

## Task 6: Championship cascade delete (C1) and the championship lock

**Files:** `championships.repository.ts`, `championships.service.ts`, new `championships.service.spec.ts`, `robots.repository.ts`, `robots.service.ts` (+ spec), `matches.repository.ts`, `matches.service.ts` (+ spec), new `test/championship-delete.db-spec.ts`.

**Interfaces:**
- `ChampionshipsRepository.removeCascade(id): Promise<'done' | 'not_found' | 'has_live_match'>`, in one transaction:
  1. Lock the championship `FOR UPDATE`.
  2. Lock its live matches `FOR UPDATE`.
  3. If any match is `running` or `paused`, return `'has_live_match'`.
  4. Soft-delete its matches, its robots, then the championship.
- The service maps the results to 404 `championship_not_found`, 409 `championship_has_live_match` (logged at error with `{ id }`), and `void`.
- `RobotsRepository.create(robot): Promise<Robot | null>` runs in a transaction that locks the championship `FOR SHARE`, and returns `null` when the championship is gone. `RobotsService.create` maps `null` to 404 `championship_not_found`.
- `MatchesRepository.createWithRobots` takes `championshipId` as its first parameter, locks the championship `FOR SHARE` before the robots, and returns `null` when it is gone. The service maps that to the same 404.

- [ ] **Step 1: Failing tests.**
  - `championships.service.spec.ts`, which also covers paths that have no tests today:
    - `create` rejects end < start with `championship_end_before_start`.
    - `update` checks the merged dates.
    - `findOne`/`findAll` add the counts, with zeros when there are none.
    - `remove` maps the three results.
    - A 404 logs at warn.
  - DB: a championship with 2 robots and 1 waiting match → `DELETE` 204. Then `GET /robots?championshipId=` and `GET /matches?championshipId=` return `[]`, and the same robot name works in a new championship (the index is freed).
  - DB: with a match set to `running` by SQL → 409, and nothing is deleted.
  - DB race: a raw `queryRunner` transaction locks the championship `FOR UPDATE` and sets its `deleted_at`. `robotsService.create` in that championship has not settled after 200 ms. Commit; it rejects with 404 `championship_not_found` (Review Focus 3).
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run test:db`. Stop and report.

## Final verification (superpowers:verification-before-completion)

From `apps/api`, paste the real output of each command:
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test:cov` (compare with the Task 0 baseline), and `npm run test:db` (this includes the fresh-DB migration run and the full down/up round-trip).
- A smoke test against the dev DB with `npm run start:dev` and curl:
  - Log in.
  - `GET /users` → 404.
  - Create a match; `GET /matches/:id` has robots.
  - `DELETE` a championship with a robot → 204, and its robots are gone from the list.
- `git status` shows changes only under `apps/api`, `.env.example` and `.claude/plans/`. No commits.

## Risks and effects on later issues

- **#17** will reuse `updateIf` for its transitions (`expected: { status: <from> }`), which is the race fix the review asked for. The cascade's `running`/`paused` check already protects its fights. Its migration needs a timestamp after `1791600000000`.
- **#33** adds `arena_id` to matches. `removeCascade` soft-deletes matches but doesn't touch arenas, which aren't tied to a championship, so nothing changes there.
- **#19 / #35:** not affected.
- **Migration:** `UsersUniqueUsername` fails if a database already has duplicate live usernames. Prod should have only the seeded admin. `uuid-ossp` is installed by TypeORM on connect, not by a migration; the fresh-DB test proves that still works.
- **Lock contention:** all locks are row-level and short, and the lock order is fixed (championship → robots → match) to avoid deadlocks.
- **Removed `/users`:** any client calling it gets a 404. The web app doesn't call it; `apps/web/src/api/__tests__/client.spec.ts:48` only uses the path as a fake URL.
- **`JwtStrategy` doesn't re-check the user:** this is fine while users can only be removed by hand in SQL. Revisit when a user screen exists.
- **DB tests need Postgres** (`docker compose up -d postgres`) and a user allowed to create databases. The compose superuser is.
