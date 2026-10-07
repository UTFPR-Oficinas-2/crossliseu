# Participants and Match Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task (the user chose this execution method). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organizers can register robots (participants) in a championship and schedule matches between robots of the same weight class, through the API and the four Figma screens 09, 09b, 10 and 10b.

**Architecture:** The NestJS API (`apps/api`) gains the robot and match rules from the Figma copy: unique robot names, same weight class per match, no orphaned matches, and edit/delete only while `waiting`. The Vue app (`apps/web`) follows the existing championship pattern: `src/api/*.ts` mirrors the API, `src/mocks/index.ts` maps to `@/types` and mirrors every API rule in a demo branch, views call only `@/mocks`, and form logic lives in sibling `*.ts` files with unit tests.

**Tech Stack:** NestJS 12, TypeORM 1.1 (Postgres), class-validator/class-transformer, Vitest 4 (API); Vue 3.5 `<script setup lang="ts">`, Vue Router 5, Pinia, Vitest + @vue/test-utils + jsdom (web).

**Spec:** `docs/superpowers/specs/2026-10-06-participants-and-match-scheduling.md` (copied in Task 0 from `/Users/ediasv/.claude/plans/write-a-report-for-generic-prism.md`). Read it before your task.

**Figma:** file key `kGzPxE42HygJmS0DEqQKwx` — https://www.figma.com/design/kGzPxE42HygJmS0DEqQKwx/Crossliseu-%E2%80%94-Industrial---Public---Organizer?node-id=27-581&m=dev. Section `Organizador · gestão do campeonato` (27:581). Frames: 09 Participantes `22:336` (empty state `22:487`), 09b Adicionar/editar participante `120:493`, 10 Lutas `22:496`, 10b Nova/editar luta `126:530`, Select menu `126:663`, Select option `126:666`.

**Branch and git rules (user decision):** commit every task locally, in the current checkout, on the existing branch `championship-management`. That branch already has a draft PR. Don't create other branches or worktrees, don't push, don't open PRs (not one per phase either), and never merge into `main`. Phases A–E below are only groupings of tasks.

## Global Constraints

- Interface text is pt-BR, copied verbatim from this plan (which copies Figma). Code identifiers, comments, file names and commit messages are in English.
- `apps/web` formatting: Prettier, no semicolons, single quotes, print width 100, 2-space indent. `apps/api` formatting: Prettier, semicolons, single quotes, 4-space indent, trailing commas. Run Prettier on every file you touch (`npx prettier --write <files>` in the app folder).
- API imports are ESM and end in `.js` (`'./robots.service.js'`).
- No hex colors, `rgb()`, or one-off pixel values in components: use the tokens in `apps/web/src/styles/tokens.css`. The only new tokens allowed are `--z-menu` and `--size-menu-max` (Task 10). The only new global class allowed is `.visually-hidden` (Task 8).
- **No hover styles** on buttons, tabs, options or rows (the user's standing preference). Use focus-visible, `aria-selected` and active-descendant styles instead.
- No new dependencies.
- Views import data functions only from `@/mocks`. They may import `ApiError`/`isApiEnabled` from `@/api/client`, never the `@/api/robots` or `@/api/matches` functions.
- Robot fields in the UI are only name (`name`), team (`team`) and weight class (`weightClass`). No "Aptos/Pendentes" tabs, no combat category (Arrasto/Girante…), no "responsável".
- **Weight class is one of exactly two strings: `'lightweight'` or `'heavyweight'`** (user decision; no kilograms anywhere). The API accepts only these on write (`@IsIn(WEIGHT_CLASSES)`); the web form picks one with `SelectField`. The UI shows them as "Peso leve" and "Peso pesado" (`weightClassLabel` in `apps/web/src/utils/robot.ts`). Weight classes are compared as exact strings and are never trimmed or reformatted.
- Matches can be created, edited and deleted only while `status === 'waiting'`. Don't build "Abrir operação", "Preparar", "Ver detalhes", "Em combate" or "Aguardando preparação".
- API error codes are exact strings and statuses: `robot_name_taken` 409, `robot_has_matches` 409, `match_robots_must_differ` 400, `match_weight_class_mismatch` 400, `robot_not_in_championship` 400, `match_not_editable` 409, `robot_not_found` 404, `match_not_found` 404, `championship_not_found` 404.
- Lado A is blue and always carries the visible text "Lado A". Red is only for destructive actions and errors; orange is the primary action.
- Figma MCP calls are rate-limited. A view task fetches its node once with `get_design_context` (after invoking the `figma:figma-design-to-code` skill, which is mandatory before that tool) and once with `get_screenshot`; don't re-fetch.
- Done means: `apps/api` → `npm test`, `npm run lint`, `npm run build` pass; `apps/web` → `npx vitest run`, `npm run type-check`, `npm run lint` pass. (`npm run test:unit` starts watch mode; use `npx vitest run`.)
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

## Review Focus

1. **Spacing and case variants of robot names** (`" titã "`, `"TITÃ"` vs `"Titã"`): a person expects them to be the same name, so the second one is rejected as taken. Pinned by the DTO and service tests in Task 1 (including two saves racing on the unique index: `409`, not `500`) and the demo tests in Task 6.
2. **A robot saved before this change with another weight class** (for example `"3 kg"` in a dev database): the list shows that text as is, and the edit form asks for one of the two classes instead of failing on save. Pinned in Task 6 (`weightClassLabel` fallback), Task 11 (`participantValuesFrom`) and Task 12 (view test).
3. **Unknown or malformed ids in organizer URLs** (`/manage/nope/participants`, a deleted robot or match id): the page shows its "não encontrado" state with a way back, never the retry panel or a blank page. Pinned in Tasks 9, 12, 13 and 15.
4. **A match or robot changed elsewhere between loading the form and saving** (match started, robot removed): the form shows a specific banner, not the generic one. Pinned in Tasks 14 and 15.
5. **Repeated clicks on Salvar / Remover / Excluir while a request is in flight**: exactly one request. Pinned in Tasks 9, 12 and 15.

## Resolved ambiguities (decided in this plan; flag them in reviews if they look wrong)

- **Weight classes (replaces spec 1.1.3 for `weightClass` and the "3 kg" examples).** The stored values are `lightweight` and `heavyweight`, enforced by the DTO, not by the database: there's no Postgres enum or CHECK constraint, so adding a class later only means changing `WEIGHT_CLASSES` in the API and the web. Entity columns stay `varchar`/`string` because rows written before this change may hold other text. pt-BR labels: `lightweight` → "Peso leve", `heavyweight` → "Peso pesado". Unknown values display as stored. Name and team are still trimmed and space-collapsed.
- **Weight class field in 09b.** Figma draws a text input, but with two allowed values the form uses `SelectField` (built in Task 10, before the form). The hint "Uma luta só reúne robôs da mesma categoria." stays.
- **Picker filtering in 10b.** Robô 1 always lists every robot; Robô 2 lists only Robô 1's weight class once Robô 1 is picked. Each list shows the robot picked on the other side as disabled ("Já escolhido como Robô N"). Picking a Robô 1 of another class clears Robô 2. Filtering both lists by each other would leave no way to change class.
- **After saving an edit** (participant or match) the form returns to its list, like the create flow.
- **Robot names in the match list** come from `getRobots`, loaded next to `getMatchSummaries`. `MatchSummary` keeps the fields the spec lists. The API still includes `robotA`/`robotB` as the spec asks.
- **Designer notes in Figma are not UI copy:** the "ESTADO VAZIO" overline, "· os campos seguem o modelo de competidor definido pelo backend.", "O mesmo formulário é usado para editar…". Subtitles below are used instead.

## File map

API (`apps/api/src`):
- `modules/robots/weight-class.ts` (new): `WEIGHT_CLASSES`, `WeightClass`.
- `modules/robots/dto/normalize.ts` (new): `normalizeText`, `@NormalizeText()`.
- `modules/robots/dto/create-robot.dto.ts`, `robots.repository.ts`, `robots.service.ts`, `entities/robot.entity.ts` (modified).
- `modules/robots/dto/robot-dto.spec.ts`, `modules/robots/robots.service.spec.ts` (new).
- `database/migrations/1791500000000-RobotNameUniquePerChampionship.ts` (new), `database/entities.spec.ts` (modified).
- `modules/matches/dto/create-match.dto.ts`, `matches.repository.ts`, `matches.service.ts`, `matches.controller.ts`, `matches.service.spec.ts` (modified); `modules/matches/dto/update-match.dto.ts` (new).

Web (`apps/web/src`):
- `api/robots.ts`, `api/matches.ts`, `api/__tests__/scheduling.spec.ts` (new).
- `types/index.ts` (`WeightClass`, Robot optional demo fields, `MatchSummary`).
- `utils/robot.ts` + test (new); `mocks/index.ts`, `mocks/data.ts` (modified); `mocks/__tests__/scheduling.spec.ts`, `mocks/__tests__/api-branch.spec.ts` (new).
- `router/index.ts`, `layouts/OrganizerLayout.vue` (modified); `router/__tests__/organizer-routes.spec.ts`, `layouts/__tests__/OrganizerLayout.spec.ts` (new).
- `styles/base.css` (`.visually-hidden`), `styles/tokens.css` (`--z-menu`, `--size-menu-max`).
- `views/organizer/components/` (new): `OrganizerBreadcrumb.vue`, `OrganizerFooter.vue`, `LoadStatePanel.vue`, `EmptyState.vue` + `__tests__/blocks.spec.ts`.
- `components/ui/InputField.vue` (`hideLabel` prop); `components/ui/SelectField.vue`, `components/ui/select-field.ts`, `components/ui/__tests__/SelectField.spec.ts` (new).
- `utils/match.ts` + test (new).
- `views/organizer/`: `participants-list.ts`, `participant-form.ts`, `matches-list.ts`, `match-form.ts` (new, each with a spec in `__tests__/`); `ParticipantsView.vue`, `MatchesView.vue` (rewritten); `ParticipantFormView.vue`, `MatchFormView.vue` (new) + view specs.
- `views/dev/ComponentsPreviewView.vue`, `apps/web/CLAUDE.md` (modified).

---

## Task 0: Put the spec and this plan in the repo (controller, before dispatching)

- [ ] **Step 1:** Copy the spec and the plan.

```bash
mkdir -p docs/superpowers/specs docs/superpowers/plans
cp /Users/ediasv/.claude/plans/write-a-report-for-generic-prism.md docs/superpowers/specs/2026-10-06-participants-and-match-scheduling.md
cp /Users/ediasv/.claude/plans/noble-scribbling-backus.md docs/superpowers/plans/2026-10-06-participants-and-match-scheduling.md
```

- [ ] **Step 2:** Commit.

```bash
git add docs/superpowers
git commit -m "docs: add participants and match scheduling spec and plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase A — API robot rules

### Task 1: Two weight classes, normalized robot text, unique names per championship

**Files:**
- Create: `apps/api/src/modules/robots/weight-class.ts`
- Create: `apps/api/src/modules/robots/dto/normalize.ts`
- Modify: `apps/api/src/modules/robots/dto/create-robot.dto.ts`
- Create: `apps/api/src/modules/robots/dto/robot-dto.spec.ts`
- Modify: `apps/api/src/modules/robots/robots.repository.ts`
- Modify: `apps/api/src/modules/robots/robots.service.ts`
- Create: `apps/api/src/modules/robots/robots.service.spec.ts`
- Modify: `apps/api/src/modules/robots/entities/robot.entity.ts`
- Modify: `apps/api/src/database/entities.spec.ts`
- Create: `apps/api/src/database/migrations/1791500000000-RobotNameUniquePerChampionship.ts`

**Interfaces:**
- Produces: `WEIGHT_CLASSES = ['lightweight', 'heavyweight'] as const` and `type WeightClass` in `apps/api/src/modules/robots/weight-class.ts`; `CreateRobotDto.weightClass: WeightClass` (anything else is a 400 with `weightClass must be one of the following values: lightweight, heavyweight`). `normalizeText(value: string): string` (the web mirrors it in Task 6). `RobotsRepository.findByName(championshipId: string, name: string): Promise<Robot | null>`. `RobotsRepository.findAll` now orders by `createdAt ASC`. `RobotsService.create`/`update` throw `ConflictException('robot_name_taken')`.

- [ ] **Step 1: Write the failing DTO test** — `apps/api/src/modules/robots/dto/robot-dto.spec.ts`

```ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRobotDto } from './create-robot.dto.js';
import { UpdateRobotDto } from './update-robot.dto.js';
import { normalizeText } from './normalize.js';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';

describe('normalizeText', () => {
    it('trims and collapses whitespace', () => {
        expect(normalizeText('  Equipe \t  Volt  ')).toBe('Equipe Volt');
    });
});

describe('robot DTOs', () => {
    it('normalizes name and team on create', async () => {
        const dto = plainToInstance(CreateRobotDto, {
            name: '  Titã  ',
            team: 'Equipe   Volt',
            weightClass: 'heavyweight',
            championshipId: CHAMPIONSHIP_ID,
        });

        expect(await validate(dto)).toEqual([]);
        expect(dto).toMatchObject({
            name: 'Titã',
            team: 'Equipe Volt',
            weightClass: 'heavyweight',
        });
    });

    it.each(['lightweight', 'heavyweight'])(
        'accepts the %s weight class',
        async (weightClass) => {
            const dto = plainToInstance(CreateRobotDto, {
                name: 'Titã',
                team: 'Equipe Volt',
                weightClass,
                championshipId: CHAMPIONSHIP_ID,
            });

            expect(await validate(dto)).toEqual([]);
        },
    );

    it.each(['3 kg', 'Lightweight', ' lightweight', '', 42])(
        'rejects %j as a weight class',
        async (weightClass) => {
            const dto = plainToInstance(CreateRobotDto, {
                name: 'Titã',
                team: 'Equipe Volt',
                weightClass,
                championshipId: CHAMPIONSHIP_ID,
            });

            const errors = await validate(dto);

            expect(errors.map((error) => error.property)).toEqual([
                'weightClass',
            ]);
        },
    );

    it('rejects values that are blank after trimming', async () => {
        const dto = plainToInstance(CreateRobotDto, {
            name: '   ',
            team: 'Equipe Volt',
            weightClass: 'lightweight',
            championshipId: CHAMPIONSHIP_ID,
        });

        const errors = await validate(dto);

        expect(errors.map((error) => error.property)).toEqual(['name']);
    });

    it('leaves non-strings for @IsString to reject', async () => {
        const dto = plainToInstance(CreateRobotDto, {
            name: 42,
            team: 'Equipe Volt',
            weightClass: 'lightweight',
            championshipId: CHAMPIONSHIP_ID,
        });

        const errors = await validate(dto);

        expect(errors.map((error) => error.property)).toEqual(['name']);
    });

    it('applies the same rules on update', async () => {
        const dto = plainToInstance(UpdateRobotDto, {
            name: '  Titã ',
            weightClass: '3 kg',
        });

        expect(dto.name).toBe('Titã');
        expect((await validate(dto)).map((error) => error.property)).toEqual([
            'weightClass',
        ]);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/api && npx vitest run src/modules/robots/dto`
Expected: FAIL, cannot resolve `./normalize.js`.

- [ ] **Step 3: Implement the weight classes and the normalizer.** Create `apps/api/src/modules/robots/weight-class.ts` (same pattern as `MatchState` in `match.entity.ts`):

```ts
/**
 * The only weight classes for now (no kilograms); a match pairs two robots of the same class.
 * The DTOs enforce them on write. The column stays varchar, so the list can grow without a
 * migration, and rows saved before this rule may hold other text.
 */
export const WEIGHT_CLASSES = ['lightweight', 'heavyweight'] as const;

export type WeightClass = (typeof WEIGHT_CLASSES)[number];
```

Create `apps/api/src/modules/robots/dto/normalize.ts`:

```ts
import { Transform } from 'class-transformer';

/** Trims and collapses whitespace runs: "  Equipe   Volt " → "Equipe Volt" */
export function normalizeText(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
}

// Non-strings pass through untouched so @IsString still reports them
export const NormalizeText = () =>
    Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? normalizeText(value) : value,
    );
```

Replace `apps/api/src/modules/robots/dto/create-robot.dto.ts` with:

```ts
import { IsIn, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { NormalizeText } from './normalize.js';
import { WEIGHT_CLASSES, type WeightClass } from '../weight-class.js';

export class CreateRobotDto {
    @NormalizeText()
    @IsString()
    @IsNotEmpty()
    name: string;

    // Exact values: no trimming, no case folding
    @IsIn(WEIGHT_CLASSES)
    weightClass: WeightClass;

    @NormalizeText()
    @IsString()
    @IsNotEmpty()
    team: string;

    @IsUUID()
    championshipId: string;
}
```

`UpdateRobotDto` (`PartialType(OmitType(...))` from `@nestjs/swagger`) inherits the transforms and validators; leave it unchanged. Leave the `Robot` entity's `weightClass: string` column type as it is (older rows).

- [ ] **Step 4: Run the DTO test**

Run: `cd apps/api && npx vitest run src/modules/robots/dto`
Expected: PASS (all tests). If "applies the same rules on update" fails, `PartialType` did not copy the decorators: add them to `UpdateRobotDto` explicitly instead of changing the test.

- [ ] **Step 5: Write the failing service test** — `apps/api/src/modules/robots/robots.service.spec.ts`

```ts
import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { RobotsService } from './robots.service.js';
import { Robot } from './entities/robot.entity.js';
import type { RobotsRepository } from './robots.repository.js';
import type { ChampionshipsService } from '../championships/championships.service.js';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CHAMPIONSHIP_ID = '22222222-2222-4222-8222-222222222222';
const TITA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MARTE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function robot(
    id: string,
    name: string,
    championshipId = CHAMPIONSHIP_ID,
): Robot {
    const entity = new Robot(name, 'lightweight', 'Equipe Volt', championshipId);
    entity.id = id;
    return entity;
}

function setup(robots: Robot[]) {
    const robotsRepository = {
        create: vi.fn((entity: Robot) => Promise.resolve(entity)),
        findOne: vi.fn((id: string) =>
            Promise.resolve(robots.find((entity) => entity.id === id) ?? null),
        ),
        // Case-insensitive, like the LOWER(name) query
        findByName: vi.fn((championshipId: string, name: string) =>
            Promise.resolve(
                robots.find(
                    (entity) =>
                        entity.championshipId === championshipId &&
                        entity.name.toLowerCase() === name.toLowerCase(),
                ) ?? null,
            ),
        ),
        update: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
    };
    const championshipsService = {
        findOne: vi.fn().mockResolvedValue({ id: CHAMPIONSHIP_ID }),
    };
    const service = new RobotsService(
        robotsRepository as unknown as RobotsRepository,
        championshipsService as unknown as ChampionshipsService,
    );

    return { service, robotsRepository, championshipsService };
}

// What pg raises when the second of two racing saves hits the unique name index
const uniqueViolation = () =>
    new QueryFailedError(
        'INSERT INTO "robots"',
        [],
        Object.assign(new Error('duplicate key value'), { code: '23505' }),
    );

const createDto = {
    name: 'Titã',
    weightClass: 'lightweight' as const,
    team: 'Equipe Volt',
    championshipId: CHAMPIONSHIP_ID,
};

describe('RobotsService.create', () => {
    it('saves the robot in its championship', async () => {
        const { service, robotsRepository, championshipsService } = setup([]);

        const created = await service.create(createDto);

        expect(championshipsService.findOne).toHaveBeenCalledWith(
            CHAMPIONSHIP_ID,
        );
        expect(robotsRepository.create).toHaveBeenCalledOnce();
        expect(created).toMatchObject(createDto);
    });

    it('rejects a name already used in the championship, ignoring case', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);

        await expect(
            service.create({ ...createDto, name: 'TITÃ' }),
        ).rejects.toThrow(new ConflictException('robot_name_taken'));
        expect(robotsRepository.create).not.toHaveBeenCalled();
    });

    it('allows a name used in another championship', async () => {
        const { service, robotsRepository } = setup([
            robot(TITA_ID, 'Titã', OTHER_CHAMPIONSHIP_ID),
        ]);

        await service.create(createDto);

        expect(robotsRepository.create).toHaveBeenCalledOnce();
    });

    it('reports a save that lost a race on the unique index as robot_name_taken', async () => {
        const { service, robotsRepository } = setup([]);
        robotsRepository.create.mockRejectedValue(uniqueViolation());

        await expect(service.create(createDto)).rejects.toThrow(
            new ConflictException('robot_name_taken'),
        );
    });

    it('rejects an unknown championship', async () => {
        const { service, robotsRepository, championshipsService } = setup([]);
        championshipsService.findOne.mockRejectedValue(
            new NotFoundException('championship_not_found'),
        );

        await expect(service.create(createDto)).rejects.toThrow(
            new NotFoundException('championship_not_found'),
        );
        expect(robotsRepository.create).not.toHaveBeenCalled();
    });
});

describe('RobotsService.update', () => {
    it('lets a robot keep its own name with different case', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);

        await service.update(TITA_ID, { name: 'TITÃ' });

        expect(robotsRepository.update).toHaveBeenCalledWith(TITA_ID, {
            name: 'TITÃ',
        });
    });

    it('rejects the name of another robot in the championship', async () => {
        const { service, robotsRepository } = setup([
            robot(TITA_ID, 'Titã'),
            robot(MARTE_ID, 'Marte'),
        ]);

        await expect(
            service.update(MARTE_ID, { name: 'titã' }),
        ).rejects.toThrow(new ConflictException('robot_name_taken'));
        expect(robotsRepository.update).not.toHaveBeenCalled();
    });

    it('skips the name check when the name is not changing', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);

        await service.update(TITA_ID, { team: 'Equipe Nova' });

        expect(robotsRepository.findByName).not.toHaveBeenCalled();
        expect(robotsRepository.update).toHaveBeenCalledWith(TITA_ID, {
            team: 'Equipe Nova',
        });
    });

    it('maps a unique index race on update to robot_name_taken', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);
        robotsRepository.update.mockRejectedValue(uniqueViolation());

        await expect(
            service.update(TITA_ID, { name: 'Marte' }),
        ).rejects.toThrow(new ConflictException('robot_name_taken'));
    });

    it('rejects an unknown robot', async () => {
        const { service } = setup([]);

        await expect(
            service.update(TITA_ID, { name: 'Titã' }),
        ).rejects.toThrow(new NotFoundException('robot_not_found'));
    });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `cd apps/api && npx vitest run src/modules/robots/robots.service.spec.ts`
Expected: FAIL. The name-taken and race tests fail (no check exists yet).

- [ ] **Step 7: Implement the repository and service**

In `apps/api/src/modules/robots/robots.repository.ts`, change the typeorm import to `import { Raw, Repository } from 'typeorm';`, replace `findAll`, and add `findByName`:

```ts
    findAll(championshipId?: string): Promise<Robot[]> {
        return this.repository.find({
            where: championshipId ? { championshipId } : {},
            // Registration order keeps the organizer list stable
            order: { createdAt: 'ASC' },
        });
    }

    /** The live robot in the championship with this name, ignoring case */
    findByName(championshipId: string, name: string): Promise<Robot | null> {
        return this.repository.findOne({
            where: {
                championshipId,
                name: Raw((alias) => `LOWER(${alias}) = LOWER(:name)`, {
                    name,
                }),
            },
        });
    }
```

Replace `apps/api/src/modules/robots/robots.service.ts` with:

```ts
import {
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { RobotsRepository } from './robots.repository.js';
import { Robot } from './entities/robot.entity.js';
import { CreateRobotDto } from './dto/create-robot.dto.js';
import { UpdateRobotDto } from './dto/update-robot.dto.js';
import { ChampionshipsService } from '../championships/championships.service.js';

/** Postgres unique_violation: two saves raced past assertNameAvailable and hit the name index */
function isUniqueViolation(error: unknown): boolean {
    return (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: unknown }).code === '23505'
    );
}

@Injectable()
export class RobotsService {
    logger: Logger = new Logger(RobotsService.name);

    constructor(
        private readonly robotsRepository: RobotsRepository,
        private readonly championshipsService: ChampionshipsService,
    ) {}

    async create(createRobotDto: CreateRobotDto) {
        const { name, weightClass, team, championshipId } = createRobotDto;

        // Throws championship_not_found when it does not exist
        await this.championshipsService.findOne(championshipId);
        await this.assertNameAvailable(championshipId, name);

        const robot: Robot = new Robot(name, weightClass, team, championshipId);

        return this.rethrowNameTaken(() => this.robotsRepository.create(robot));
    }

    findAll(championshipId?: string) {
        return this.robotsRepository.findAll(championshipId);
    }

    async findOne(id: string) {
        const robot = await this.robotsRepository.findOne(id);

        if (!robot) {
            this.logger.error('robot_not_found', { id: id });
            throw new NotFoundException('robot_not_found');
        }

        return robot;
    }

    async update(id: string, updateRobotDto: UpdateRobotDto) {
        const robot = await this.findOne(id);

        if (updateRobotDto.name !== undefined) {
            await this.assertNameAvailable(
                robot.championshipId,
                updateRobotDto.name,
                id,
            );
        }

        await this.rethrowNameTaken(() =>
            this.robotsRepository.update(id, updateRobotDto),
        );

        return this.findOne(id);
    }

    async remove(id: string) {
        await this.findOne(id);
        await this.robotsRepository.remove(id);
    }

    /** "O nome do robô não pode se repetir dentro do mesmo campeonato" (Figma 09b), ignoring case */
    private async assertNameAvailable(
        championshipId: string,
        name: string,
        robotId?: string,
    ) {
        const existing = await this.robotsRepository.findByName(
            championshipId,
            name,
        );

        if (existing && existing.id !== robotId) {
            this.logger.error('robot_name_taken', { championshipId, name });
            throw new ConflictException('robot_name_taken');
        }
    }

    private async rethrowNameTaken<T>(save: () => Promise<T>): Promise<T> {
        try {
            return await save();
        } catch (error) {
            if (isUniqueViolation(error)) {
                this.logger.error('robot_name_taken', {
                    reason: 'unique_violation',
                });
                throw new ConflictException('robot_name_taken');
            }
            throw error;
        }
    }
}
```

- [ ] **Step 8: Run the service test**

Run: `cd apps/api && npx vitest run src/modules/robots`
Expected: PASS.

- [ ] **Step 9: Add the index metadata test** — append inside the `describe('entity metadata', …)` block of `apps/api/src/database/entities.spec.ts`:

```ts
    it('robot names are unique per championship through a migration-managed index', async () => {
        const dataSource = await buildDataSource();
        const index = dataSource
            .getMetadata(Robot)
            .indices.find(
                (entry) => entry.name === 'UQ_robots_championship_id_lower_name',
            );

        expect(index?.synchronize).toBe(false);
    });
```

Run: `cd apps/api && npx vitest run src/database/entities.spec.ts`
Expected: FAIL (`index` is undefined).

- [ ] **Step 10: Declare the index on the entity and add the migration**

In `apps/api/src/modules/robots/entities/robot.entity.ts`, add `Index` to the typeorm import and put this above `@Entity('robots')`:

```ts
// Partial expression index from migration RobotNameUniquePerChampionship1791500000000:
// (championship_id, lower(name)) WHERE deleted_at IS NULL. TypeORM can't express it, so
// `synchronize: false` keeps migration:generate from dropping it.
@Index('UQ_robots_championship_id_lower_name', { synchronize: false })
```

Create `apps/api/src/database/migrations/1791500000000-RobotNameUniquePerChampionship.ts` (generated-migration style, like its neighbors):

```ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class RobotNameUniquePerChampionship1791500000000 implements MigrationInterface {
    name = 'RobotNameUniquePerChampionship1791500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Same normalization as the robot DTO (dto/normalize.ts), so old names compare like new ones.
        // weight_class is left alone: older rows may hold text outside WEIGHT_CLASSES.
        await queryRunner.query(`UPDATE "robots" SET "name" = regexp_replace(btrim("name"), '\\s+', ' ', 'g'), "team" = regexp_replace(btrim("team"), '\\s+', ' ', 'g')`);
        const duplicates: unknown[] = await queryRunner.query(`SELECT "championship_id", lower("name") AS "name" FROM "robots" WHERE "deleted_at" IS NULL GROUP BY 1, 2 HAVING COUNT(*) > 1`);
        if (duplicates.length > 0) {
            throw new Error(`Rename robots with duplicate names before running this migration: ${JSON.stringify(duplicates)}`);
        }
        // Backstop for RobotsService.assertNameAvailable; a soft-deleted robot frees its name
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_robots_championship_id_lower_name" ON "robots" ("championship_id", lower("name")) WHERE "deleted_at" IS NULL`);
    }

    // The normalization in up() is not reverted
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "UQ_robots_championship_id_lower_name"`);
    }

}
```

- [ ] **Step 11: Run everything in the API**

Run: `cd apps/api && npm test && npm run lint && npm run build`
Expected: all pass. If Postgres is running locally (`docker compose up -d` from the repo root; see `compose.yml`), also run `npm run migration:run`, `npm run migration:revert`, `npm run migration:run` and confirm each succeeds. If Postgres isn't available, say so in your report; don't skip silently.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/modules/robots apps/api/src/database
git commit -m "feat(api): restrict robot weight classes and keep names unique per championship

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Block removing a robot that is in a match

**Files:**
- Modify: `apps/api/src/modules/robots/robots.repository.ts`
- Modify: `apps/api/src/modules/robots/robots.service.ts`
- Modify: `apps/api/src/modules/robots/robots.service.spec.ts`

**Interfaces:**
- Consumes: Task 1's `RobotsService` and spec `setup()`.
- Produces: `RobotsRepository.hasMatches(id: string): Promise<boolean>`. `RobotsService.remove` and a `weightClass` change in `update` throw `ConflictException('robot_has_matches')`.

- [ ] **Step 1: Extend the spec's `setup` and add failing tests.** In `robots.service.spec.ts`, change the signature to `function setup(robots: Robot[], { hasMatches = false }: { hasMatches?: boolean } = {})` and add `hasMatches: vi.fn().mockResolvedValue(hasMatches),` to the `robotsRepository` mock. Then append:

```ts
describe('RobotsService.remove', () => {
    it('soft-deletes a robot without matches', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);

        await service.remove(TITA_ID);

        expect(robotsRepository.hasMatches).toHaveBeenCalledWith(TITA_ID);
        expect(robotsRepository.remove).toHaveBeenCalledWith(TITA_ID);
    });

    it('keeps a robot that is in a match', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')], {
            hasMatches: true,
        });

        await expect(service.remove(TITA_ID)).rejects.toThrow(
            new ConflictException('robot_has_matches'),
        );
        expect(robotsRepository.remove).not.toHaveBeenCalled();
    });

    it('rejects an unknown robot', async () => {
        const { service } = setup([]);

        await expect(service.remove(TITA_ID)).rejects.toThrow(
            new NotFoundException('robot_not_found'),
        );
    });
});

describe('RobotsService.update while in a match', () => {
    it('rejects a weight class change', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')], {
            hasMatches: true,
        });

        await expect(
            service.update(TITA_ID, { weightClass: 'heavyweight' }),
        ).rejects.toThrow(new ConflictException('robot_has_matches'));
        expect(robotsRepository.update).not.toHaveBeenCalled();
    });

    it('allows other changes and the same weight class', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')], {
            hasMatches: true,
        });
        const dto = {
            name: 'Titã II',
            team: 'Equipe Nova',
            weightClass: 'lightweight' as const,
        };

        await service.update(TITA_ID, dto);

        expect(robotsRepository.hasMatches).not.toHaveBeenCalled();
        expect(robotsRepository.update).toHaveBeenCalledWith(TITA_ID, dto);
    });

    it('allows a weight class change when the robot has no matches', async () => {
        const { service, robotsRepository } = setup([robot(TITA_ID, 'Titã')]);

        await service.update(TITA_ID, { weightClass: 'heavyweight' });

        expect(robotsRepository.update).toHaveBeenCalledWith(TITA_ID, {
            weightClass: 'heavyweight',
        });
    });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd apps/api && npx vitest run src/modules/robots/robots.service.spec.ts`
Expected: FAIL on "keeps a robot that is in a match" and "rejects a weight class change".

- [ ] **Step 3: Implement.** In `robots.repository.ts` add `import { Match } from '../matches/entities/match.entity.js';` and:

```ts
    /** Whether a live (not soft-deleted) match uses the robot on either side */
    hasMatches(id: string): Promise<boolean> {
        // Queried through the entity manager, not MatchesService: MatchesModule already imports
        // RobotsModule (same approach as ChampionshipsRepository.countRobotsAndMatches)
        return this.repository.manager.exists(Match, {
            where: [{ robotAId: id }, { robotBId: id }],
        });
    }
```

In `robots.service.ts`, add the weight-class guard to `update` (after the name check, before saving), guard `remove`, and add the helper:

```ts
        if (
            updateRobotDto.weightClass !== undefined &&
            updateRobotDto.weightClass !== robot.weightClass
        ) {
            // A match pairs robots of one weight class (MatchesService.resolveRobots)
            await this.assertHasNoMatches(id);
        }
```

```ts
    async remove(id: string) {
        await this.findOne(id);
        // Matches keep pointing at their robots; a soft-deleted robot would orphan them
        await this.assertHasNoMatches(id);
        await this.robotsRepository.remove(id);
    }
```

```ts
    private async assertHasNoMatches(id: string) {
        if (await this.robotsRepository.hasMatches(id)) {
            this.logger.error('robot_has_matches', { id });
            throw new ConflictException('robot_has_matches');
        }
    }
```

- [ ] **Step 4: Run the API checks**

Run: `cd apps/api && npm test && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/robots
git commit -m "feat(api): keep robots that are in matches from being removed or reclassed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase B — API match scheduling

### Task 3: Derive the match weight class and list matches per championship

**Files:**
- Modify: `apps/api/src/modules/matches/dto/create-match.dto.ts`
- Modify: `apps/api/src/modules/matches/matches.service.ts`
- Modify: `apps/api/src/modules/matches/matches.repository.ts`
- Modify: `apps/api/src/modules/matches/matches.controller.ts`
- Modify (rewrite): `apps/api/src/modules/matches/matches.service.spec.ts`

**Interfaces:**
- Produces: `CreateMatchDto = { championshipId, robotAId, robotBId }` (no `weightClass`; clients that still send it get a 400 from `forbidNonWhitelisted`). `MatchesService.findAll(championshipId?: string)`. Private `MatchesService.resolveRobots(championshipId, robotAId, robotBId): Promise<string>` (Task 4 reuses it). `GET /matches?championshipId=` returns matches with `robotA`/`robotB` in creation order.

- [ ] **Step 1: Rewrite the spec with the new fixtures and failing tests** — replace `matches.service.spec.ts` with:

```ts
import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MatchesService } from './matches.service.js';
import { Match } from './entities/match.entity.js';
import { Robot } from '../robots/entities/robot.entity.js';
import type { MatchesRepository } from './matches.repository.js';
import type { ChampionshipsService } from '../championships/championships.service.js';
import type { RobotsService } from '../robots/robots.service.js';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CHAMPIONSHIP_ID = '22222222-2222-4222-8222-222222222222';
const ROBOT_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ROBOT_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function robot(
    id: string,
    { championshipId = CHAMPIONSHIP_ID, weightClass = 'lightweight' } = {},
): Robot {
    const entity = new Robot(`robot-${id}`, weightClass, 'team', championshipId);
    entity.id = id;
    return entity;
}

function setup(robots: Robot[], matches: Match[] = []) {
    const matchesRepository = {
        create: vi.fn((entity: Match) => Promise.resolve(entity)),
        findAll: vi.fn().mockResolvedValue(matches),
        findOne: vi.fn((id: string) =>
            Promise.resolve(matches.find((entity) => entity.id === id) ?? null),
        ),
        // Applies the change so the service's reload sees it
        update: vi.fn((id: string, partial: Partial<Match>) => {
            Object.assign(
                matches.find((entity) => entity.id === id) ?? {},
                partial,
            );
            return Promise.resolve();
        }),
        remove: vi.fn().mockResolvedValue(undefined),
    };
    const championshipsService = {
        findOne: vi.fn().mockResolvedValue({ id: CHAMPIONSHIP_ID }),
    };
    const robotsService = {
        findOne: vi.fn((id: string) => {
            const found = robots.find((entity) => entity.id === id);
            return found
                ? Promise.resolve(found)
                : Promise.reject(new NotFoundException('robot_not_found'));
        }),
    };
    const service = new MatchesService(
        matchesRepository as unknown as MatchesRepository,
        championshipsService as unknown as ChampionshipsService,
        robotsService as unknown as RobotsService,
    );

    return { service, matchesRepository, championshipsService };
}

const dto = {
    championshipId: CHAMPIONSHIP_ID,
    robotAId: ROBOT_A_ID,
    robotBId: ROBOT_B_ID,
};

describe('MatchesService.create', () => {
    it('saves a waiting match with the championship and both robots', async () => {
        const { service, matchesRepository, championshipsService } = setup([
            robot(ROBOT_A_ID),
            robot(ROBOT_B_ID),
        ]);

        const created = await service.create(dto);

        expect(championshipsService.findOne).toHaveBeenCalledWith(
            CHAMPIONSHIP_ID,
        );
        expect(matchesRepository.create).toHaveBeenCalledOnce();
        expect(created).toMatchObject({
            weightClass: 'lightweight',
            championshipId: CHAMPIONSHIP_ID,
            robotAId: ROBOT_A_ID,
            robotBId: ROBOT_B_ID,
            status: 'waiting',
        });
    });

    it('stores the weight class shared by the robots', async () => {
        const { service } = setup([
            robot(ROBOT_A_ID, { weightClass: 'heavyweight' }),
            robot(ROBOT_B_ID, { weightClass: 'heavyweight' }),
        ]);

        const created = await service.create(dto);

        expect(created.weightClass).toBe('heavyweight');
    });

    it('rejects robots of different weight classes', async () => {
        const { service, matchesRepository } = setup([
            robot(ROBOT_A_ID, { weightClass: 'lightweight' }),
            robot(ROBOT_B_ID, { weightClass: 'heavyweight' }),
        ]);

        await expect(service.create(dto)).rejects.toThrow(
            new BadRequestException('match_weight_class_mismatch'),
        );
        expect(matchesRepository.create).not.toHaveBeenCalled();
    });

    it('rejects the same robot on both sides', async () => {
        const { service, matchesRepository } = setup([robot(ROBOT_A_ID)]);

        await expect(
            service.create({ ...dto, robotBId: ROBOT_A_ID }),
        ).rejects.toThrow(new BadRequestException('match_robots_must_differ'));
        expect(matchesRepository.create).not.toHaveBeenCalled();
    });

    it('rejects a robot registered in another championship', async () => {
        const { service, matchesRepository } = setup([
            robot(ROBOT_A_ID),
            robot(ROBOT_B_ID, { championshipId: OTHER_CHAMPIONSHIP_ID }),
        ]);

        await expect(service.create(dto)).rejects.toThrow(
            new BadRequestException('robot_not_in_championship'),
        );
        expect(matchesRepository.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown robot', async () => {
        const { service, matchesRepository } = setup([robot(ROBOT_A_ID)]);

        await expect(service.create(dto)).rejects.toThrow(
            new NotFoundException('robot_not_found'),
        );
        expect(matchesRepository.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown championship', async () => {
        const { service, matchesRepository, championshipsService } = setup([
            robot(ROBOT_A_ID),
            robot(ROBOT_B_ID),
        ]);
        championshipsService.findOne.mockRejectedValue(
            new NotFoundException('championship_not_found'),
        );

        await expect(service.create(dto)).rejects.toThrow(
            new NotFoundException('championship_not_found'),
        );
        expect(matchesRepository.create).not.toHaveBeenCalled();
    });
});

describe('MatchesService.findAll', () => {
    it('passes the championship filter to the repository', async () => {
        const { service, matchesRepository } = setup([]);

        await service.findAll(CHAMPIONSHIP_ID);

        expect(matchesRepository.findAll).toHaveBeenCalledWith(CHAMPIONSHIP_ID);
    });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd apps/api && npx vitest run src/modules/matches`
Expected: FAIL. `stores the weight class…` fails (the service stores the DTO's undefined `weightClass`), `rejects robots of different weight classes` fails, and `findAll` is called without the id. TypeScript in the test may also flag `dto` lacking `weightClass`.

- [ ] **Step 3: Implement.** Replace `create-match.dto.ts` with:

```ts
import { IsUUID } from 'class-validator';

// The weight class is not sent: MatchesService takes it from the two robots
export class CreateMatchDto {
    @IsUUID()
    championshipId: string;

    @IsUUID()
    robotAId: string;

    @IsUUID()
    robotBId: string;
}
```

In `matches.service.ts`, replace `create` and `findAll`, and add `resolveRobots`:

```ts
    async create(createMatchDto: CreateMatchDto) {
        const { championshipId, robotAId, robotBId } = createMatchDto;

        // Throws championship_not_found when it does not exist
        await this.championshipsService.findOne(championshipId);

        const weightClass = await this.resolveRobots(
            championshipId,
            robotAId,
            robotBId,
        );

        const match: Match = new Match(
            weightClass,
            championshipId,
            robotAId,
            robotBId,
        );

        return this.matchesRepository.create(match);
    }

    findAll(championshipId?: string) {
        return this.matchesRepository.findAll(championshipId);
    }
```

```ts
    /**
     * Checks that the robots differ, exist, belong to the championship and share a weight class
     * ("Dois robôs diferentes… da mesma categoria de peso", Figma 10b). Returns that class.
     */
    private async resolveRobots(
        championshipId: string,
        robotAId: string,
        robotBId: string,
    ): Promise<string> {
        if (robotAId === robotBId) {
            this.logger.error('match_robots_must_differ', { robotAId });
            throw new BadRequestException('match_robots_must_differ');
        }

        // Throws robot_not_found when either does not exist
        const [robotA, robotB] = await Promise.all([
            this.robotsService.findOne(robotAId),
            this.robotsService.findOne(robotBId),
        ]);

        for (const robot of [robotA, robotB]) {
            if (robot.championshipId !== championshipId) {
                this.logger.error('robot_not_in_championship', {
                    robotId: robot.id,
                    championshipId,
                });
                throw new BadRequestException('robot_not_in_championship');
            }
        }

        if (robotA.weightClass !== robotB.weightClass) {
            this.logger.error('match_weight_class_mismatch', {
                robotAId,
                robotBId,
            });
            throw new BadRequestException('match_weight_class_mismatch');
        }

        return robotA.weightClass;
    }
```

In `matches.repository.ts`, replace `findAll`:

```ts
    findAll(championshipId?: string): Promise<Match[]> {
        return this.repository.find({
            where: championshipId ? { championshipId } : {},
            // Robot names for the organizer list without one request per robot
            relations: { robotA: true, robotB: true },
            // Fights are ordered manually by creation; there is no bracket
            order: { createdAt: 'ASC' },
        });
    }
```

In `matches.controller.ts`, add `Query` to the `@nestjs/common` import, `ApiQuery` to the `@nestjs/swagger` import, drop the unused `UseGuards`, and replace `findAll`:

```ts
    @Public()
    @Get()
    @ApiQuery({ name: 'championshipId', required: false })
    findAll(
        @Query('championshipId', new ParseUUIDPipe({ optional: true }))
        championshipId?: string,
    ) {
        return this.matchesService.findAll(championshipId);
    }
```

- [ ] **Step 4: Run the API checks**

Run: `cd apps/api && npm test && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/matches
git commit -m "feat(api): derive match weight class from robots and list matches per championship

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Edit and delete scheduled matches

**Files:**
- Create: `apps/api/src/modules/matches/dto/update-match.dto.ts`
- Modify: `apps/api/src/modules/matches/matches.service.ts`
- Modify: `apps/api/src/modules/matches/matches.controller.ts`
- Modify: `apps/api/src/modules/matches/matches.service.spec.ts`

**Interfaces:**
- Consumes: `resolveRobots` and the spec fixtures from Task 3.
- Produces: `PATCH /matches/:id` with `{ robotAId?, robotBId? }` returns the updated match; `DELETE /matches/:id` returns 204. Both throw `ConflictException('match_not_editable')` unless `status === 'waiting'`, and `NotFoundException('match_not_found')` for unknown ids.

- [ ] **Step 1: Write the failing tests.** In `matches.service.spec.ts`, add `ConflictException` to the `@nestjs/common` import, add `import type { MatchState } from './entities/match.entity.js';`, add these fixtures below `ROBOT_B_ID` / after `robot()`:

```ts
const ROBOT_C_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MATCH_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function match(status: MatchState = 'waiting'): Match {
    const entity = new Match(
        'lightweight',
        CHAMPIONSHIP_ID,
        ROBOT_A_ID,
        ROBOT_B_ID,
    );
    entity.id = MATCH_ID;
    entity.status = status;
    return entity;
}
```

and append:

```ts
describe('MatchesService.update', () => {
    it('swaps a robot and re-derives the weight class', async () => {
        const { service, matchesRepository } = setup(
            [robot(ROBOT_A_ID), robot(ROBOT_B_ID), robot(ROBOT_C_ID)],
            [match()],
        );

        const updated = await service.update(MATCH_ID, { robotBId: ROBOT_C_ID });

        expect(matchesRepository.update).toHaveBeenCalledWith(MATCH_ID, {
            robotAId: ROBOT_A_ID,
            robotBId: ROBOT_C_ID,
            weightClass: 'lightweight',
        });
        expect(updated).toMatchObject({
            robotAId: ROBOT_A_ID,
            robotBId: ROBOT_C_ID,
        });
    });

    it('checks the merged pair against the match championship', async () => {
        const { service, matchesRepository } = setup(
            [
                robot(ROBOT_A_ID),
                robot(ROBOT_B_ID),
                robot(ROBOT_C_ID, { championshipId: OTHER_CHAMPIONSHIP_ID }),
            ],
            [match()],
        );

        await expect(
            service.update(MATCH_ID, { robotBId: ROBOT_C_ID }),
        ).rejects.toThrow(new BadRequestException('robot_not_in_championship'));
        expect(matchesRepository.update).not.toHaveBeenCalled();
    });

    it('rejects a robot of another weight class', async () => {
        const { service, matchesRepository } = setup(
            [
                robot(ROBOT_A_ID),
                robot(ROBOT_B_ID),
                robot(ROBOT_C_ID, { weightClass: 'heavyweight' }),
            ],
            [match()],
        );

        await expect(
            service.update(MATCH_ID, { robotBId: ROBOT_C_ID }),
        ).rejects.toThrow(new BadRequestException('match_weight_class_mismatch'));
        expect(matchesRepository.update).not.toHaveBeenCalled();
    });

    it('rejects the robot already on the other side', async () => {
        const { service } = setup(
            [robot(ROBOT_A_ID), robot(ROBOT_B_ID)],
            [match()],
        );

        await expect(
            service.update(MATCH_ID, { robotBId: ROBOT_A_ID }),
        ).rejects.toThrow(new BadRequestException('match_robots_must_differ'));
    });

    it.each(['running', 'paused', 'finished'] as const)(
        'rejects editing a %s match',
        async (status) => {
            const { service, matchesRepository } = setup(
                [robot(ROBOT_A_ID), robot(ROBOT_B_ID), robot(ROBOT_C_ID)],
                [match(status)],
            );

            await expect(
                service.update(MATCH_ID, { robotBId: ROBOT_C_ID }),
            ).rejects.toThrow(new ConflictException('match_not_editable'));
            expect(matchesRepository.update).not.toHaveBeenCalled();
        },
    );

    it('rejects an unknown match', async () => {
        const { service } = setup([robot(ROBOT_A_ID), robot(ROBOT_B_ID)]);

        await expect(
            service.update(MATCH_ID, { robotBId: ROBOT_B_ID }),
        ).rejects.toThrow(new NotFoundException('match_not_found'));
    });
});

describe('MatchesService.remove', () => {
    it('soft-deletes a waiting match', async () => {
        const { service, matchesRepository } = setup([], [match()]);

        await service.remove(MATCH_ID);

        expect(matchesRepository.remove).toHaveBeenCalledWith(MATCH_ID);
    });

    it.each(['running', 'paused', 'finished'] as const)(
        'keeps a %s match',
        async (status) => {
            const { service, matchesRepository } = setup([], [match(status)]);

            await expect(service.remove(MATCH_ID)).rejects.toThrow(
                new ConflictException('match_not_editable'),
            );
            expect(matchesRepository.remove).not.toHaveBeenCalled();
        },
    );

    it('rejects an unknown match', async () => {
        const { service } = setup([]);

        await expect(service.remove(MATCH_ID)).rejects.toThrow(
            new NotFoundException('match_not_found'),
        );
    });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd apps/api && npx vitest run src/modules/matches`
Expected: FAIL (`service.update`/`service.remove` are not functions).

- [ ] **Step 3: Implement.** Create `dto/update-match.dto.ts`:

```ts
import { PartialType, PickType } from '@nestjs/swagger';
import { CreateMatchDto } from './create-match.dto.js';

// A match stays in its championship; only the robots change, and only while it is waiting
export class UpdateMatchDto extends PartialType(
    PickType(CreateMatchDto, ['robotAId', 'robotBId'] as const),
) {}
```

In `matches.service.ts`, add `ConflictException` to the `@nestjs/common` import, import `UpdateMatchDto`, and add:

```ts
    async update(id: string, updateMatchDto: UpdateMatchDto) {
        const match = await this.findOne(id);
        this.assertEditable(match);

        const robotAId = updateMatchDto.robotAId ?? match.robotAId;
        const robotBId = updateMatchDto.robotBId ?? match.robotBId;
        const weightClass = await this.resolveRobots(
            match.championshipId,
            robotAId,
            robotBId,
        );

        await this.matchesRepository.update(id, {
            robotAId,
            robotBId,
            weightClass,
        });

        return this.findOne(id);
    }

    async remove(id: string) {
        const match = await this.findOne(id);
        this.assertEditable(match);
        await this.matchesRepository.remove(id);
    }

    /** Only scheduled (`waiting`) matches can be edited or deleted */
    private assertEditable(match: Match) {
        if (match.status !== 'waiting') {
            this.logger.error('match_not_editable', {
                id: match.id,
                status: match.status,
            });
            throw new ConflictException('match_not_editable');
        }
    }
```

In `matches.controller.ts`, import `HttpCode`, `HttpStatus` and `UpdateMatchDto`, and replace the two stubs:

```ts
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateMatchDto: UpdateMatchDto,
    ) {
        return this.matchesService.update(id, updateMatchDto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.matchesService.remove(id);
    }
```

- [ ] **Step 4: Run the API checks**

Run: `cd apps/api && npm test && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/matches
git commit -m "feat(api): edit and delete scheduled matches

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase C — Web foundation

### Task 5: API modules for robots and matches, and the type split

**Files:**
- Create: `apps/web/src/api/robots.ts`
- Create: `apps/web/src/api/matches.ts`
- Create: `apps/web/src/api/__tests__/scheduling.spec.ts`
- Modify: `apps/web/src/types/index.ts`

**Interfaces:**
- Consumes: `apiRequest` from `apps/web/src/api/client.ts`.
- Produces: `WeightClass` in `@/types`; `ApiRobot`, `ApiCreateRobot` (`weightClass: WeightClass`), `ApiUpdateRobot`, `listRobots(championshipId)`, `createRobot(body, token)`, `updateRobot(id, body, token)`, `deleteRobot(id, token)`; `ApiMatchStatus`, `ApiMatch`, `ApiCreateMatch`, `ApiUpdateMatch`, `listMatches(championshipId)`, `createMatch(body, token)`, `updateMatch(id, body, token)`, `deleteMatch(id, token)`. Types: `Robot` with optional `owner`/`category`/`status`; new `MatchSummary`; `Match extends MatchSummary`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/api/__tests__/scheduling.spec.ts`

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMatch, deleteMatch, listMatches, updateMatch } from '../matches'
import { createRobot, deleteRobot, listRobots, updateRobot } from '../robots'

// A fresh Response per call: a body can only be read once
function stubFetch(status = 200, body: unknown = {}) {
  const fetchMock = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status })),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function lastRequest(fetchMock: ReturnType<typeof stubFetch>) {
  const [url, init] = fetchMock.mock.calls.at(-1)!
  const headers = (init?.headers ?? {}) as Record<string, string>
  return {
    url: String(url),
    method: init?.method,
    body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    authorization: headers.Authorization,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('robots API', () => {
  it('lists the robots of one championship', async () => {
    const fetchMock = stubFetch(200, [])

    await listRobots('c1')

    expect(lastRequest(fetchMock).url).toMatch(/\/robots\?championshipId=c1$/)
    expect(lastRequest(fetchMock).method).toBe('GET')
  })

  it('creates and updates with the token', async () => {
    const fetchMock = stubFetch()
    const body = {
      name: 'Titã',
      team: 'Equipe Volt',
      weightClass: 'lightweight' as const,
      championshipId: 'c1',
    }

    await createRobot(body, 'tok')
    expect(lastRequest(fetchMock)).toMatchObject({
      method: 'POST',
      body,
      authorization: 'Bearer tok',
    })
    expect(lastRequest(fetchMock).url).toMatch(/\/robots$/)

    await updateRobot('r 1', { name: 'Titã II' }, 'tok')
    expect(lastRequest(fetchMock)).toMatchObject({ method: 'PATCH', body: { name: 'Titã II' } })
    expect(lastRequest(fetchMock).url).toMatch(/\/robots\/r%201$/)
  })

  it('deletes with the token and resolves on 204', async () => {
    const fetchMock = stubFetch(204)

    await expect(deleteRobot('r1', 'tok')).resolves.toBeUndefined()

    expect(lastRequest(fetchMock)).toMatchObject({ method: 'DELETE', authorization: 'Bearer tok' })
    expect(lastRequest(fetchMock).url).toMatch(/\/robots\/r1$/)
  })
})

describe('matches API', () => {
  it('lists the matches of one championship', async () => {
    const fetchMock = stubFetch(200, [])

    await listMatches('c1')

    expect(lastRequest(fetchMock).url).toMatch(/\/matches\?championshipId=c1$/)
  })

  it('creates without a weight class and updates only the robots', async () => {
    const fetchMock = stubFetch()

    await createMatch({ championshipId: 'c1', robotAId: 'r1', robotBId: 'r2' }, 'tok')
    expect(lastRequest(fetchMock)).toMatchObject({
      method: 'POST',
      body: { championshipId: 'c1', robotAId: 'r1', robotBId: 'r2' },
      authorization: 'Bearer tok',
    })

    await updateMatch('m1', { robotBId: 'r3' }, 'tok')
    expect(lastRequest(fetchMock)).toMatchObject({ method: 'PATCH', body: { robotBId: 'r3' } })
    expect(lastRequest(fetchMock).url).toMatch(/\/matches\/m1$/)
  })

  it('deletes with the token', async () => {
    const fetchMock = stubFetch(204)

    await deleteMatch('m1', 'tok')

    expect(lastRequest(fetchMock)).toMatchObject({ method: 'DELETE', authorization: 'Bearer tok' })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/web && npx vitest run src/api/__tests__/scheduling.spec.ts`
Expected: FAIL, cannot resolve `../matches` / `../robots`.

- [ ] **Step 3: Implement the modules** — `apps/web/src/api/robots.ts`

```ts
// `RobotsController` in apps/api (`@Controller('robots')`). Shapes mirror the API response;
// mapping to `@/types` happens in `@/mocks`. The API trims names and teams, so a response can
// differ from what was sent.
import type { WeightClass } from '@/types'
import { apiRequest } from './client'

/** `Robot` entity as serialized by apps/api. Dates are ISO strings. */
export interface ApiRobot {
  id: string
  name: string
  /** A `WeightClass`; rows saved before weight classes were fixed may hold other text */
  weightClass: string
  team: string
  championshipId: string
  createdAt: string
  modifiedAt: string
  deletedAt: string | null
}

/** `CreateRobotDto` */
export interface ApiCreateRobot {
  name: string
  /** Anything else is a 400 */
  weightClass: WeightClass
  team: string
  championshipId: string
}

/** `UpdateRobotDto`: a robot stays in the championship it was registered in */
export type ApiUpdateRobot = Partial<Omit<ApiCreateRobot, 'championshipId'>>

/** GET /robots?championshipId= (public), in registration order */
export function listRobots(championshipId: string): Promise<ApiRobot[]> {
  return apiRequest(`/robots?${new URLSearchParams({ championshipId })}`)
}

/** POST /robots (JWT). 404 `championship_not_found`, 409 `robot_name_taken`. */
export function createRobot(body: ApiCreateRobot, token: string): Promise<ApiRobot> {
  return apiRequest('/robots', { method: 'POST', body, token })
}

/** PATCH /robots/:id (JWT). 409 `robot_name_taken`, or `robot_has_matches` on a class change. */
export function updateRobot(id: string, body: ApiUpdateRobot, token: string): Promise<ApiRobot> {
  return apiRequest(`/robots/${encodeURIComponent(id)}`, { method: 'PATCH', body, token })
}

/** DELETE /robots/:id (JWT). 204, soft delete. 409 `robot_has_matches`. */
export function deleteRobot(id: string, token: string): Promise<void> {
  return apiRequest(`/robots/${encodeURIComponent(id)}`, { method: 'DELETE', token })
}
```

`apps/web/src/api/matches.ts`

```ts
// `MatchesController` in apps/api (`@Controller('matches')`). Only scheduling lives here: list,
// create, and edit or delete while the match is `waiting`.
import { apiRequest } from './client'
import type { ApiRobot } from './robots'

/** `MatchState` in apps/api, serialized as `status` */
export type ApiMatchStatus = 'waiting' | 'running' | 'paused' | 'finished'

/** `Match` entity as serialized by apps/api. Dates are ISO strings. */
export interface ApiMatch {
  id: string
  /** Shared by both robots; the API takes it from them */
  weightClass: string
  status: ApiMatchStatus
  championshipId: string
  robotAId: string
  robotBId: string
  /** Included by GET /matches */
  robotA?: ApiRobot
  robotB?: ApiRobot
  createdAt: string
  modifiedAt: string
  deletedAt: string | null
}

/** `CreateMatchDto`. There is no weight class: the API derives it from the robots. */
export interface ApiCreateMatch {
  championshipId: string
  robotAId: string
  robotBId: string
}

/** `UpdateMatchDto` */
export type ApiUpdateMatch = Partial<Pick<ApiCreateMatch, 'robotAId' | 'robotBId'>>

/** GET /matches?championshipId= (public), in creation order */
export function listMatches(championshipId: string): Promise<ApiMatch[]> {
  return apiRequest(`/matches?${new URLSearchParams({ championshipId })}`)
}

/**
 * POST /matches (JWT). 400 `match_robots_must_differ`, `robot_not_in_championship` or
 * `match_weight_class_mismatch`; 404 `robot_not_found` or `championship_not_found`.
 */
export function createMatch(body: ApiCreateMatch, token: string): Promise<ApiMatch> {
  return apiRequest('/matches', { method: 'POST', body, token })
}

/** PATCH /matches/:id (JWT). Same errors as create, plus 409 `match_not_editable`. */
export function updateMatch(id: string, body: ApiUpdateMatch, token: string): Promise<ApiMatch> {
  return apiRequest(`/matches/${encodeURIComponent(id)}`, { method: 'PATCH', body, token })
}

/** DELETE /matches/:id (JWT). 204, soft delete. 409 `match_not_editable` unless waiting. */
export function deleteMatch(id: string, token: string): Promise<void> {
  return apiRequest(`/matches/${encodeURIComponent(id)}`, { method: 'DELETE', token })
}
```

- [ ] **Step 4: Split the types** — in `apps/web/src/types/index.ts`, add this union next to the other status unions:

```ts
/** Robot weight class: only two for now (no kilograms). A match pairs robots of one class. */
export type WeightClass = 'lightweight' | 'heavyweight'
```

Then replace the `Robot` and `Match` interfaces with:

```ts
/** A participant: one robot entered in a championship */
export interface Robot {
  id: string
  championshipId: string
  name: string
  team: string
  /** Demo data only: the API has no owner (Responsável), and the UI no longer shows it */
  owner?: string
  /** A `WeightClass`; robots saved before weight classes were fixed may hold other text */
  weightClass: string
  /** Demo data only: combat category ("Arrasto", "Girante", "Cunha"), not shown */
  category?: string
  /** Demo data only: weigh-in status, not shown */
  status?: RobotStatus
  createdAt: string
  modifiedAt: string
}
```

```ts
/** What the organizer screens need from a match (Figma 10 and 10b) */
export interface MatchSummary {
  id: string
  championshipId: string
  /** Shared by both robots; see `Robot.weightClass` */
  weightClass: string
  robotAId: string
  robotBId: string
  state: MatchState
  createdAt: string
  modifiedAt: string
}

/** A match with the operator, referee and public fields (still demo data only) */
export interface Match extends MatchSummary {
  /** Fight number shown as "Luta 07" */
  number: number
  /** Manual position in the fight order; there is no automatic bracket */
  order: number
  arenaId: string
  roundDurationSeconds: number
  elapsedSeconds: number
  startedAt: string | null
  operatorName: string | null
  /** "Logitech C920 · 1080p" */
  camera: string | null
  referees: MatchReferee[]
  result: MatchResult | null
  recordingStatus: ProcessingStatus
  uploadStatus: ProcessingStatus
  /** 0–100 while the upload is processing */
  uploadProgress: number | null
  analysisStatus: ProcessingStatus
  heatmaps: RobotHeatmap[]
}
```

- [ ] **Step 5: Run the test and the type check**

Run: `cd apps/web && npx vitest run src/api && npm run type-check`
Expected: PASS. Nothing reads `robot.owner`, `robot.category` or `robot.status` today; if type-check finds a reader, guard it (`v-if`) instead of making the field required again.

- [ ] **Step 6: Lint and commit**

Run: `cd apps/web && npm run lint` (expected: no errors)

```bash
git add apps/web/src/api apps/web/src/types/index.ts
git commit -m "feat(web): add robots and matches API modules and MatchSummary type

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Data layer for robots and match scheduling (API and demo branches)

**Files:**
- Create: `apps/web/src/utils/robot.ts`
- Create: `apps/web/src/utils/__tests__/robot.spec.ts`
- Modify: `apps/web/src/mocks/index.ts`
- Modify: `apps/web/src/mocks/data.ts`
- Create: `apps/web/src/mocks/__tests__/scheduling.spec.ts`
- Create: `apps/web/src/mocks/__tests__/api-branch.spec.ts`
- Modify: `apps/web/CLAUDE.md`

**Interfaces:**
- Consumes: Task 5's API modules and types.
- Produces (all from `@/mocks`):
  - `interface RobotInput { name: string; team: string; weightClass: WeightClass }`
  - `interface MatchInput { robotAId: string; robotBId: string }`
  - `getRobots(championshipId: string): Promise<Robot[]>` (API branch added)
  - `getMatchSummaries(championshipId: string): Promise<MatchSummary[]>`
  - `createRobot(championshipId: string, input: RobotInput, token: string): Promise<Robot>`
  - `updateRobot(id: string, input: RobotInput, token: string): Promise<Robot>`
  - `deleteRobot(id: string, token: string): Promise<void>`
  - `createMatch(championshipId: string, input: MatchInput, token: string): Promise<MatchSummary>`
  - `updateMatch(id: string, input: MatchInput, token: string): Promise<MatchSummary>`
  - `deleteMatch(id: string, token: string): Promise<void>`
  - Demo errors are `ApiError(status, code, [code])` with the codes and statuses in Global Constraints.
  - From `@/utils/robot`: `normalizeText(value: string): string`, `WEIGHT_CLASSES: readonly WeightClass[]`, `WEIGHT_CLASS_LABELS: Record<WeightClass, string>`, `isWeightClass(value: string): value is WeightClass`, `weightClassLabel(value: string): string` (the pt-BR label, or the value itself when it isn't one of the two).

- [ ] **Step 1: Write the failing robot helpers test** — `apps/web/src/utils/__tests__/robot.spec.ts`

```ts
import { describe, expect, it } from 'vitest'
import { WEIGHT_CLASSES, isWeightClass, normalizeText, weightClassLabel } from '../robot'

describe('normalizeText', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeText('  Equipe \t  Volt  ')).toBe('Equipe Volt')
  })
})

describe('weight classes', () => {
  it('lists exactly the two classes the API accepts', () => {
    expect(WEIGHT_CLASSES).toEqual(['lightweight', 'heavyweight'])
  })

  it('recognizes only the exact values', () => {
    expect(isWeightClass('heavyweight')).toBe(true)
    expect(isWeightClass('Heavyweight')).toBe(false)
    expect(isWeightClass('lightweight')).toBe(false)
    expect(isWeightClass('')).toBe(false)
  })

  it('labels them in pt-BR and shows older values as stored', () => {
    expect(weightClassLabel('lightweight')).toBe('Peso leve')
    expect(weightClassLabel('heavyweight')).toBe('Peso pesado')
    expect(weightClassLabel('lightweight')).toBe('lightweight')
  })
})
```

- [ ] **Step 2: Write the failing demo-rules test** — `apps/web/src/mocks/__tests__/scheduling.spec.ts`

```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import {
  createChampionship,
  createMatch,
  createRobot,
  deleteMatch,
  deleteRobot,
  getMatchSummaries,
  getRobots,
  updateMatch,
  updateRobot,
  type RobotInput,
} from '@/mocks'
import { matchId } from '@/mocks/data'

// Demo data is a module-level singleton: each test works in its own championship
async function newChampionship() {
  const { id } = await createChampionship(
    { name: 'Copa Teste', startDate: '2026-01-01', endDate: '2026-01-02' },
    't',
  )
  return id
}

const tita: RobotInput = { name: 'Titã', team: 'Equipe Volt', weightClass: 'lightweight' }
const marte: RobotInput = { name: 'Marte', team: 'Equipe Órbita', weightClass: 'lightweight' }
const aco: RobotInput = { name: 'Aço', team: 'Equipe Aço', weightClass: 'lightweight' }
const bigorna: RobotInput = { name: 'Bigorna', team: 'Equipe Bigorna', weightClass: 'heavyweight' }

const rejection = (status: number, code: string) => ({ status, details: [code] })

async function championshipWithRobots() {
  const id = await newChampionship()
  const a = await createRobot(id, tita, 't')
  const b = await createRobot(id, marte, 't')
  const c = await createRobot(id, aco, 't')
  const heavy = await createRobot(id, bigorna, 't')
  return { id, a, b, c, heavy }
}

describe('demo robot writes', () => {
  it('normalizes names and teams and lists robots in registration order', async () => {
    const id = await newChampionship()
    await createRobot(id, { name: '  Titã ', team: 'Equipe   Volt', weightClass: 'lightweight' }, 't')
    await createRobot(id, marte, 't')

    expect((await getRobots(id)).map((r) => [r.name, r.team, r.weightClass])).toEqual([
      ['Titã', 'Equipe Volt', 'lightweight'],
      ['Marte', 'Equipe Órbita', 'lightweight'],
    ])
  })

  it('rejects a name already used in the championship, ignoring case and spaces', async () => {
    const id = await newChampionship()
    await createRobot(id, tita, 't')

    await expect(createRobot(id, { ...marte, name: ' TITÃ ' }, 't')).rejects.toMatchObject(
      rejection(409, 'robot_name_taken'),
    )
  })

  it('allows the same name in another championship and lets a robot keep its name', async () => {
    const first = await newChampionship()
    const second = await newChampionship()
    const robot = await createRobot(first, tita, 't')

    await expect(createRobot(second, tita, 't')).resolves.toMatchObject({ name: 'Titã' })
    await expect(updateRobot(robot.id, { ...tita, name: 'titã' }, 't')).resolves.toMatchObject({
      name: 'titã',
    })
  })

  it('rejects an unknown championship or robot', async () => {
    await expect(createRobot('missing', tita, 't')).rejects.toMatchObject(
      rejection(404, 'championship_not_found'),
    )
    await expect(updateRobot('missing', tita, 't')).rejects.toMatchObject(
      rejection(404, 'robot_not_found'),
    )
    await expect(deleteRobot('missing', 't')).rejects.toBeInstanceOf(ApiError)
  })

  it('keeps a robot that is in a match from being removed or reclassed', async () => {
    const { id, a, b } = await championshipWithRobots()
    await createMatch(id, { robotAId: a.id, robotBId: b.id }, 't')

    await expect(deleteRobot(a.id, 't')).rejects.toMatchObject(rejection(409, 'robot_has_matches'))
    await expect(updateRobot(a.id, { ...tita, weightClass: 'heavyweight' }, 't')).rejects.toMatchObject(
      rejection(409, 'robot_has_matches'),
    )
    await expect(updateRobot(a.id, { ...tita, team: 'Equipe Nova' }, 't')).resolves.toMatchObject(
      { team: 'Equipe Nova' },
    )
  })

  it('removes a robot without matches', async () => {
    const id = await newChampionship()
    const robot = await createRobot(id, tita, 't')

    await deleteRobot(robot.id, 't')

    expect(await getRobots(id)).toEqual([])
  })
})

describe('demo match writes', () => {
  it('creates a waiting match with the weight class of its robots', async () => {
    const { id, a, b } = await championshipWithRobots()

    const created = await createMatch(id, { robotAId: a.id, robotBId: b.id }, 't')

    expect(created).toMatchObject({
      championshipId: id,
      robotAId: a.id,
      robotBId: b.id,
      weightClass: 'lightweight',
      state: 'waiting',
    })
    expect(await getMatchSummaries(id)).toEqual([created])
  })

  it('rejects like the API', async () => {
    const { id, a, heavy } = await championshipWithRobots()
    const outsider = await createRobot(await newChampionship(), tita, 't')

    await expect(createMatch(id, { robotAId: a.id, robotBId: a.id }, 't')).rejects.toMatchObject(
      rejection(400, 'match_robots_must_differ'),
    )
    await expect(
      createMatch(id, { robotAId: a.id, robotBId: heavy.id }, 't'),
    ).rejects.toMatchObject(rejection(400, 'match_weight_class_mismatch'))
    await expect(
      createMatch(id, { robotAId: a.id, robotBId: outsider.id }, 't'),
    ).rejects.toMatchObject(rejection(400, 'robot_not_in_championship'))
    await expect(
      createMatch(id, { robotAId: a.id, robotBId: 'missing' }, 't'),
    ).rejects.toMatchObject(rejection(404, 'robot_not_found'))
  })

  it('edits and deletes a waiting match', async () => {
    const { id, a, b, c } = await championshipWithRobots()
    const created = await createMatch(id, { robotAId: a.id, robotBId: b.id }, 't')

    await expect(
      updateMatch(created.id, { robotAId: a.id, robotBId: c.id }, 't'),
    ).resolves.toMatchObject({ robotBId: c.id, weightClass: 'lightweight' })
    await deleteMatch(created.id, 't')

    expect(await getMatchSummaries(id)).toEqual([])
  })

  it('refuses to edit or delete a match that is no longer waiting', async () => {
    // Fight 07 in the demo data is running
    const running = matchId(7)

    await expect(
      updateMatch(running, { robotAId: 'x', robotBId: 'y' }, 't'),
    ).rejects.toMatchObject(rejection(409, 'match_not_editable'))
    await expect(deleteMatch(running, 't')).rejects.toMatchObject(
      rejection(409, 'match_not_editable'),
    )
  })
})
```

- [ ] **Step 3: Write the failing API-branch test** — `apps/web/src/mocks/__tests__/api-branch.spec.ts`

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Pretend VITE_API_URL is set so `@/mocks` takes its API branches
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  isApiEnabled: true,
}))
vi.mock('@/api/robots', () => ({
  listRobots: vi.fn(),
  createRobot: vi.fn(),
  updateRobot: vi.fn(),
  deleteRobot: vi.fn(),
}))
vi.mock('@/api/matches', () => ({
  listMatches: vi.fn(),
  createMatch: vi.fn(),
  updateMatch: vi.fn(),
  deleteMatch: vi.fn(),
}))

import { createMatch as postMatch, listMatches, type ApiMatch } from '@/api/matches'
import { createRobot as postRobot, listRobots, type ApiRobot } from '@/api/robots'
import { createMatch, createRobot, getMatchSummaries, getRobots } from '@/mocks'

const createdAt = '2026-10-01T00:00:00.000Z'
const modifiedAt = '2026-10-02T00:00:00.000Z'

const apiRobot: ApiRobot = {
  id: 'r1',
  championshipId: 'c1',
  name: 'Titã',
  team: 'Equipe Volt',
  weightClass: 'lightweight',
  createdAt,
  modifiedAt,
  deletedAt: null,
}

const apiMatch: ApiMatch = {
  id: 'm1',
  championshipId: 'c1',
  weightClass: 'lightweight',
  status: 'paused',
  robotAId: 'r1',
  robotBId: 'r2',
  robotA: apiRobot,
  createdAt,
  modifiedAt,
  deletedAt: null,
}

describe('@/mocks with the API configured', () => {
  beforeEach(() => {
    vi.mocked(listRobots).mockReset()
    vi.mocked(listMatches).mockReset()
    vi.mocked(postRobot).mockReset()
    vi.mocked(postMatch).mockReset()
  })

  it('maps API robots to the domain type', async () => {
    vi.mocked(listRobots).mockResolvedValue([apiRobot])

    expect(await getRobots('c1')).toEqual([
      {
        id: 'r1',
        championshipId: 'c1',
        name: 'Titã',
        team: 'Equipe Volt',
        weightClass: 'lightweight',
        createdAt,
        modifiedAt,
      },
    ])
    expect(listRobots).toHaveBeenCalledWith('c1')
  })

  it('maps match status to state and drops the embedded robots', async () => {
    vi.mocked(listMatches).mockResolvedValue([apiMatch])

    expect(await getMatchSummaries('c1')).toEqual([
      {
        id: 'm1',
        championshipId: 'c1',
        weightClass: 'lightweight',
        robotAId: 'r1',
        robotBId: 'r2',
        state: 'paused',
        createdAt,
        modifiedAt,
      },
    ])
  })

  it('adds the championship id to create payloads', async () => {
    vi.mocked(postRobot).mockResolvedValue(apiRobot)
    vi.mocked(postMatch).mockResolvedValue(apiMatch)

    await createRobot('c1', { name: 'Titã', team: 'Equipe Volt', weightClass: 'lightweight' }, 'tok')
    await createMatch('c1', { robotAId: 'r1', robotBId: 'r2' }, 'tok')

    expect(postRobot).toHaveBeenCalledWith(
      { name: 'Titã', team: 'Equipe Volt', weightClass: 'lightweight', championshipId: 'c1' },
      'tok',
    )
    expect(postMatch).toHaveBeenCalledWith(
      { robotAId: 'r1', robotBId: 'r2', championshipId: 'c1' },
      'tok',
    )
  })
})
```

- [ ] **Step 4: Run the three tests and watch them fail**

Run: `cd apps/web && npx vitest run src/utils/__tests__/robot.spec.ts src/mocks`
Expected: FAIL (missing `../robot`, missing exports such as `createRobot` and `getMatchSummaries`).

- [ ] **Step 5: Implement `apps/web/src/utils/robot.ts`**

```ts
// Robot rules shared by the participant screens, the match form and the demo data layer. Mirrors
// apps/api/src/modules/robots (`dto/normalize.ts`, `weight-class.ts`), so the form preview and
// demo mode store exactly what the API would.
import type { WeightClass } from '@/types'

/** Trims and collapses whitespace runs: "  Equipe   Volt " → "Equipe Volt" */
export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

/** Same values and order as `WEIGHT_CLASSES` in apps/api */
export const WEIGHT_CLASSES: readonly WeightClass[] = ['lightweight', 'heavyweight']

export const WEIGHT_CLASS_LABELS: Record<WeightClass, string> = {
  lightweight: 'Peso leve',
  heavyweight: 'Peso pesado',
}

export function isWeightClass(value: string): value is WeightClass {
  return (WEIGHT_CLASSES as readonly string[]).includes(value)
}

/** "Peso leve" / "Peso pesado". Text saved before weight classes were fixed shows as stored. */
export function weightClassLabel(value: string): string {
  return isWeightClass(value) ? WEIGHT_CLASS_LABELS[value] : value
}
```

- [ ] **Step 6: Update the demo data** in `apps/web/src/mocks/data.ts`.

Add `WeightClass` to the `@/types` import. Give `robot()` a last parameter and use it instead of the hardcoded `'3 kg'`:

```ts
function robot(
  n: number,
  name: string,
  team: string,
  owner: string,
  category: string,
  status: Robot['status'] = 'eligible',
  weightClass: WeightClass = 'lightweight',
): Robot {
```

(in the returned object, replace `weightClass: '3 kg',` with `weightClass,`). Make Titã and Nêmesis heavyweight; everyone else stays lightweight:

```ts
  robot(1, 'Titã', 'Equipe Volt', 'A. Moraes', 'Arrasto', 'eligible', 'heavyweight'),
  robot(2, 'Nêmesis', 'Equipe Impacto', 'R. Silveira', 'Girante', 'eligible', 'heavyweight'),
```

In `match()`, change the default `weightClass: '3 kg',` to `weightClass: 'lightweight',`, and add `weightClass: 'heavyweight',` to fight 07 (Titã × Nêmesis). Every demo fight then pairs robots of one class. Right after the `match()` function, add:

```ts
/** Builds a match with the defaults above; demo writes in `@/mocks` use it for new matches */
export const buildDemoMatch = match
```

- [ ] **Step 7: Extend `apps/web/src/mocks/index.ts`.**

Update the header comment's second sentence to: `Functions backed by apps/api switch to it when \`VITE_API_URL\` is set (championships, robots, match scheduling, sign-in); the rest still serve demo data.`

Add these imports next to the existing ones (and add `MatchSummary` and `WeightClass` to the `@/types` import):

```ts
import {
  createMatch as postMatch,
  deleteMatch as removeMatch,
  listMatches,
  updateMatch as patchMatch,
  type ApiMatch,
} from '@/api/matches'
import {
  createRobot as postRobot,
  deleteRobot as removeRobot,
  listRobots,
  updateRobot as patchRobot,
  type ApiRobot,
} from '@/api/robots'
import { normalizeText } from '@/utils/robot'
```

Add a shared id helper above `createChampionship` and use it there (replace the inline `crypto.randomUUID?.() ?? …` expression with `newDemoId()`, keeping its comment on the helper):

```ts
// `crypto.randomUUID` only exists in secure contexts (not on a plain-http LAN origin)
const newDemoId = () =>
  crypto.randomUUID?.() ?? `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`

const demoError = (status: number, code: string) => new ApiError(status, code, [code])
```

Replace the existing `getRobots` with the block below, and add `getMatchSummaries` right after `getMatches`:

```ts
function toRobot(api: ApiRobot): Robot {
  return {
    id: api.id,
    championshipId: api.championshipId,
    name: api.name,
    team: api.team,
    weightClass: api.weightClass,
    createdAt: api.createdAt,
    modifiedAt: api.modifiedAt,
  }
}

/** Robots of a championship in registration order. GET /robots when the API is configured. */
export async function getRobots(championshipId: string): Promise<Robot[]> {
  if (isApiEnabled) return (await listRobots(championshipId)).map(toRobot)
  const { robots } = await demo()
  return robots.filter((r) => r.championshipId === championshipId)
}

/** Form payload for create and update (`CreateRobotDto` without the championship) */
export interface RobotInput {
  name: string
  team: string
  weightClass: WeightClass
}

// Same normalization as the API DTO: `@NormalizeText` on name and team; the weight class is exact
function normalizeRobotInput(input: RobotInput): RobotInput {
  return {
    name: normalizeText(input.name),
    team: normalizeText(input.team),
    weightClass: input.weightClass,
  }
}

// Same rules and codes as `RobotsService` in apps/api
function assertDemoNameAvailable(
  robots: Robot[],
  championshipId: string,
  name: string,
  robotId?: string,
) {
  const lower = name.toLocaleLowerCase('pt-BR')
  const taken = robots.some(
    (r) =>
      r.championshipId === championshipId &&
      r.id !== robotId &&
      r.name.toLocaleLowerCase('pt-BR') === lower,
  )
  if (taken) throw demoError(409, 'robot_name_taken')
}

const demoRobotHasMatches = (matches: Match[], robotId: string) =>
  matches.some((m) => m.robotAId === robotId || m.robotBId === robotId)

/** POST /robots (JWT). In demo mode the robot is added to the in-memory list. */
export async function createRobot(
  championshipId: string,
  input: RobotInput,
  token: string,
): Promise<Robot> {
  if (isApiEnabled) return toRobot(await postRobot({ ...input, championshipId }, token))
  const { championships, robots } = await demo()
  if (!championships.some((c) => c.id === championshipId)) {
    throw demoError(404, 'championship_not_found')
  }
  const normalized = normalizeRobotInput(input)
  assertDemoNameAvailable(robots, championshipId, normalized.name)
  const now = new Date().toISOString()
  const robot: Robot = {
    id: newDemoId(),
    championshipId,
    ...normalized,
    createdAt: now,
    modifiedAt: now,
  }
  robots.push(robot)
  return { ...robot }
}

/** PATCH /robots/:id (JWT). In demo mode the in-memory robot is updated. */
export async function updateRobot(id: string, input: RobotInput, token: string): Promise<Robot> {
  if (isApiEnabled) return toRobot(await patchRobot(id, input, token))
  const { robots, matches } = await demo()
  const robot = robots.find((r) => r.id === id)
  if (!robot) throw demoError(404, 'robot_not_found')
  const normalized = normalizeRobotInput(input)
  assertDemoNameAvailable(robots, robot.championshipId, normalized.name, id)
  if (normalized.weightClass !== robot.weightClass && demoRobotHasMatches(matches, id)) {
    throw demoError(409, 'robot_has_matches')
  }
  Object.assign(robot, normalized, { modifiedAt: new Date().toISOString() })
  return { ...robot }
}

/** DELETE /robots/:id (JWT). Refused while any match uses the robot. */
export async function deleteRobot(id: string, token: string): Promise<void> {
  if (isApiEnabled) return removeRobot(id, token)
  const { robots, matches } = await demo()
  const index = robots.findIndex((r) => r.id === id)
  if (index === -1) throw demoError(404, 'robot_not_found')
  if (demoRobotHasMatches(matches, id)) throw demoError(409, 'robot_has_matches')
  robots.splice(index, 1)
}
```

```ts
function toMatchSummary(api: ApiMatch): MatchSummary {
  return {
    id: api.id,
    championshipId: api.championshipId,
    weightClass: api.weightClass,
    robotAId: api.robotAId,
    robotBId: api.robotBId,
    state: api.status,
    createdAt: api.createdAt,
    modifiedAt: api.modifiedAt,
  }
}

// Drops the operator fields of a demo `Match`
const summaryOf = (match: MatchSummary): MatchSummary => ({
  id: match.id,
  championshipId: match.championshipId,
  weightClass: match.weightClass,
  robotAId: match.robotAId,
  robotBId: match.robotBId,
  state: match.state,
  createdAt: match.createdAt,
  modifiedAt: match.modifiedAt,
})

/** Matches of a championship for the organizer screens. GET /matches when the API is configured. */
export async function getMatchSummaries(championshipId: string): Promise<MatchSummary[]> {
  if (isApiEnabled) return (await listMatches(championshipId)).map(toMatchSummary)
  return (await getMatches(championshipId)).map(summaryOf)
}

/** Form payload for create and update */
export interface MatchInput {
  robotAId: string
  robotBId: string
}

// Same checks and codes as `MatchesService.resolveRobots` in apps/api; returns the shared class
function resolveDemoRobots(robots: Robot[], championshipId: string, input: MatchInput): string {
  if (input.robotAId === input.robotBId) throw demoError(400, 'match_robots_must_differ')
  const robotA = robots.find((r) => r.id === input.robotAId)
  const robotB = robots.find((r) => r.id === input.robotBId)
  if (!robotA || !robotB) throw demoError(404, 'robot_not_found')
  if (robotA.championshipId !== championshipId || robotB.championshipId !== championshipId) {
    throw demoError(400, 'robot_not_in_championship')
  }
  if (robotA.weightClass !== robotB.weightClass) {
    throw demoError(400, 'match_weight_class_mismatch')
  }
  return robotA.weightClass
}

/** POST /matches (JWT). In demo mode the match is appended to the fight order. */
export async function createMatch(
  championshipId: string,
  input: MatchInput,
  token: string,
): Promise<MatchSummary> {
  if (isApiEnabled) return toMatchSummary(await postMatch({ ...input, championshipId }, token))
  const { championships, robots, matches, buildDemoMatch } = await demo()
  if (!championships.some((c) => c.id === championshipId)) {
    throw demoError(404, 'championship_not_found')
  }
  const weightClass = resolveDemoRobots(robots, championshipId, input)
  const number =
    Math.max(0, ...matches.filter((m) => m.championshipId === championshipId).map((m) => m.number)) +
    1
  const now = new Date().toISOString()
  const match = buildDemoMatch({
    ...input,
    id: newDemoId(),
    championshipId,
    number,
    order: number,
    weightClass,
    createdAt: now,
    modifiedAt: now,
  })
  matches.push(match)
  return summaryOf(match)
}

// Same guard as `MatchesService.assertEditable` in apps/api
function findEditableDemoMatch(matches: Match[], id: string): Match {
  const match = matches.find((m) => m.id === id)
  if (!match) throw demoError(404, 'match_not_found')
  if (match.state !== 'waiting') throw demoError(409, 'match_not_editable')
  return match
}

/** PATCH /matches/:id (JWT). Only waiting matches. */
export async function updateMatch(
  id: string,
  input: MatchInput,
  token: string,
): Promise<MatchSummary> {
  if (isApiEnabled) return toMatchSummary(await patchMatch(id, input, token))
  const { robots, matches } = await demo()
  const match = findEditableDemoMatch(matches, id)
  const weightClass = resolveDemoRobots(robots, match.championshipId, input)
  Object.assign(match, input, { weightClass, modifiedAt: new Date().toISOString() })
  return summaryOf(match)
}

/** DELETE /matches/:id (JWT). Only waiting matches. */
export async function deleteMatch(id: string, token: string): Promise<void> {
  if (isApiEnabled) return removeMatch(id, token)
  const { matches } = await demo()
  const match = findEditableDemoMatch(matches, id)
  matches.splice(matches.indexOf(match), 1)
}
```

Leave `getMatches`, `getMatch`, `getLiveMatch` and `getLiveFight` as they are (the operator screens need the full `Match`; `getLiveFight` returns early when the API is configured, so its `getRobots` call stays on demo data).

- [ ] **Step 8: Run the tests**

Run: `cd apps/web && npx vitest run src/utils src/mocks src/api`
Expected: PASS, including the existing `championships.spec.ts`.

- [ ] **Step 9: Update `apps/web/CLAUDE.md`**
  - In "Project structure", change the `api/` line to: `api/           fetch client for apps/api (client.ts, auth.ts, championships.ts, robots.ts, matches.ts)`.
  - In "Coding rules", change the sentence starting "Sign-in and championships already use the API" to: `Sign-in, championships, participants and match scheduling use the API through \`src/api/\`; every other page still uses typed data from \`src/mocks/\`.` Keep the rest of that bullet.

- [ ] **Step 10: Type-check, lint and commit**

Run: `cd apps/web && npm run type-check && npm run lint`
Expected: no errors.

```bash
git add apps/web/src/utils apps/web/src/mocks apps/web/CLAUDE.md
git commit -m "feat(web): load and save robots and scheduled matches through the data layer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Organizer routes for the forms and sidebar highlighting

**Files:**
- Modify: `apps/web/src/router/index.ts`
- Create: `apps/web/src/views/organizer/ParticipantFormView.vue` (placeholder, replaced in Task 12)
- Create: `apps/web/src/views/organizer/MatchFormView.vue` (placeholder, replaced in Task 15)
- Modify: `apps/web/src/layouts/OrganizerLayout.vue`
- Create: `apps/web/src/router/__tests__/organizer-routes.spec.ts`
- Create: `apps/web/src/layouts/__tests__/OrganizerLayout.spec.ts`

**Interfaces:**
- Produces route names and props:
  - `participant-create` → `/manage/:championshipId/participants/new`, props `{ mode: 'create', championshipId }`
  - `participant-edit` → `/manage/:championshipId/participants/:robotId/edit`, props `{ mode: 'edit', championshipId, robotId }`
  - `match-create` → `/manage/:championshipId/matches/new`, props `{ mode: 'create', championshipId }`
  - `match-edit` → `/manage/:championshipId/matches/:matchId/edit`, props `{ mode: 'edit', championshipId, matchId }`
  - `RouteMeta.sidebar?: string`: the sidebar route name to highlight.

- [ ] **Step 1: Write the failing tests.** `apps/web/src/router/__tests__/organizer-routes.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'

import router from '../index'

describe('organizer form routes', () => {
  it.each([
    ['participant-create', { championshipId: 'c1' }, '/manage/c1/participants/new', 'championship-participants'],
    ['participant-edit', { championshipId: 'c1', robotId: 'r1' }, '/manage/c1/participants/r1/edit', 'championship-participants'],
    ['match-create', { championshipId: 'c1' }, '/manage/c1/matches/new', 'championship-matches'],
    ['match-edit', { championshipId: 'c1', matchId: 'm1' }, '/manage/c1/matches/m1/edit', 'championship-matches'],
  ])('%s resolves under its sidebar item and requires sign-in', (name, params, path, sidebar) => {
    const resolved = router.resolve({ name, params })

    expect(resolved.path).toBe(path)
    expect(resolved.meta.sidebar).toBe(sidebar)
    expect(resolved.meta.requiresAuth).toBe(true)
  })
})
```

`apps/web/src/layouts/__tests__/OrganizerLayout.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import OrganizerLayout from '../OrganizerLayout.vue'

vi.mock('@/mocks', () => ({ getChampionship: vi.fn().mockResolvedValue(null) }))

const stub = { render: () => null }

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: stub },
      { path: '/championships/:championshipId', name: 'championship', component: stub },
      {
        path: '/manage',
        component: OrganizerLayout,
        children: [
          { path: '', name: 'my-championships', component: stub },
          { path: ':championshipId', name: 'championship-overview', component: stub },
          { path: ':championshipId/participants', name: 'championship-participants', component: stub },
          {
            path: ':championshipId/participants/new',
            name: 'participant-create',
            component: stub,
            meta: { sidebar: 'championship-participants' },
          },
          { path: ':championshipId/matches', name: 'championship-matches', component: stub },
          {
            path: ':championshipId/matches/:matchId/edit',
            name: 'match-edit',
            component: stub,
            meta: { sidebar: 'championship-matches' },
          },
          { path: ':championshipId/settings', name: 'championship-settings', component: stub },
        ],
      },
    ],
  })
  await router.push(path)
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

const currentItems = async (path: string) =>
  (await mountAt(path))
    .findAll('nav[aria-label="Gerenciar campeonato"] a[aria-current="page"]')
    .map((a) => a.text())

describe('OrganizerLayout sidebar', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('highlights the list a form page belongs to', async () => {
    expect(await currentItems('/manage/c1/participants/new')).toEqual(['Participantes'])
    expect(await currentItems('/manage/c1/matches/m1/edit')).toEqual(['Lutas'])
  })

  it('highlights a route without meta by its own name', async () => {
    expect(await currentItems('/manage/c1/matches')).toEqual(['Lutas'])
  })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd apps/web && npx vitest run src/router src/layouts`
Expected: FAIL (`No match for … participant-create`; no active item on the form paths).

- [ ] **Step 3: Implement.** In `apps/web/src/router/index.ts`, extend the `RouteMeta` declaration:

```ts
declare module 'vue-router' {
  interface RouteMeta {
    /** Signed-out visitors are sent to `sign-in`. UX only: the API enforces access. */
    requiresAuth?: boolean
    /** OrganizerLayout highlights this sidebar route (by name) on sub-pages such as forms */
    sidebar?: string
  }
}
```

Add these children to `/manage`, right after `championship-matches`:

```ts
          {
            path: ':championshipId/participants/new',
            name: 'participant-create',
            component: () => import('../views/organizer/ParticipantFormView.vue'),
            props: (route) => ({ mode: 'create', championshipId: route.params.championshipId }),
            meta: { sidebar: 'championship-participants' },
          },
          {
            path: ':championshipId/participants/:robotId/edit',
            name: 'participant-edit',
            component: () => import('../views/organizer/ParticipantFormView.vue'),
            props: (route) => ({
              mode: 'edit',
              championshipId: route.params.championshipId,
              robotId: route.params.robotId,
            }),
            meta: { sidebar: 'championship-participants' },
          },
          {
            path: ':championshipId/matches/new',
            name: 'match-create',
            component: () => import('../views/organizer/MatchFormView.vue'),
            props: (route) => ({ mode: 'create', championshipId: route.params.championshipId }),
            meta: { sidebar: 'championship-matches' },
          },
          {
            path: ':championshipId/matches/:matchId/edit',
            name: 'match-edit',
            component: () => import('../views/organizer/MatchFormView.vue'),
            props: (route) => ({
              mode: 'edit',
              championshipId: route.params.championshipId,
              matchId: route.params.matchId,
            }),
            meta: { sidebar: 'championship-matches' },
          },
```

Create the placeholders (same style as the current `ParticipantsView.vue`). `apps/web/src/views/organizer/ParticipantFormView.vue`:

```vue
<script setup lang="ts">
defineProps<{ mode: 'create' | 'edit'; championshipId: string; robotId?: string }>()
</script>

<template>
  <h1 class="text-heading-l">
    {{ mode === 'create' ? 'Adicionar participante' : 'Editar participante' }}
  </h1>
</template>
```

`apps/web/src/views/organizer/MatchFormView.vue`:

```vue
<script setup lang="ts">
defineProps<{ mode: 'create' | 'edit'; championshipId: string; matchId?: string }>()
</script>

<template>
  <h1 class="text-heading-l">{{ mode === 'create' ? 'Nova luta' : 'Editar luta' }}</h1>
</template>
```

In `apps/web/src/layouts/OrganizerLayout.vue`, add below `sidebarItems`:

```ts
/** Form pages set `meta.sidebar` to the list they belong to */
const activeSidebarItem = computed(() => route.meta.sidebar ?? route.name)
```

and change the `SidebarItem` binding to `:active="activeSidebarItem === item.routeName"`.

- [ ] **Step 4: Run all web tests, type-check and lint**

Run: `cd apps/web && npx vitest run && npm run type-check && npm run lint`
Expected: PASS (including `guard.spec.ts`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/router apps/web/src/layouts apps/web/src/views/organizer/ParticipantFormView.vue apps/web/src/views/organizer/MatchFormView.vue
git commit -m "feat(web): add participant and match form routes with sidebar highlighting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase D — Participants screens and the select component (Figma 09 and 09b)

### Task 8: Shared organizer page blocks

The four new pages share a breadcrumb, a footer, a loading/error/not-found panel and a dashed empty state. They are section blocks (`views/organizer/components/`, per `apps/web/CLAUDE.md`), not design-system components. Existing pages (`ChampionshipFormView`, `MyChampionshipsView`) keep their inline versions; don't refactor them.

**Files:**
- Modify: `apps/web/src/styles/base.css`
- Create: `apps/web/src/views/organizer/components/OrganizerBreadcrumb.vue`
- Create: `apps/web/src/views/organizer/components/OrganizerFooter.vue`
- Create: `apps/web/src/views/organizer/components/LoadStatePanel.vue`
- Create: `apps/web/src/views/organizer/components/EmptyState.vue`
- Create: `apps/web/src/views/organizer/components/__tests__/blocks.spec.ts`

**Interfaces:**
- Produces:
  - Global class `.visually-hidden`.
  - `<OrganizerBreadcrumb :items="{ label: string; to?: RouteLocationRaw }[]" />`: earlier items with `to` render as links; the last item is `aria-current="page"` text.
  - `<OrganizerFooter />`: "CROSSLISEU · UTFPR" plus "Conceito visual · dados demonstrativos" when the API is off.
  - `<LoadStatePanel :state="'loading' | 'error' | 'not-found'" loading-text error-text not-found-text :back="{ label: string; to: RouteLocationRaw }" @retry />`. The error panel has `role="alert"` and a "Tentar novamente" button.
  - `<EmptyState title text>` with an optional default slot for one action.

- [ ] **Step 1: Write the failing test** — `apps/web/src/views/organizer/components/__tests__/blocks.spec.ts`

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

import EmptyState from '../EmptyState.vue'
import LoadStatePanel from '../LoadStatePanel.vue'
import OrganizerBreadcrumb from '../OrganizerBreadcrumb.vue'
import OrganizerFooter from '../OrganizerFooter.vue'

const stub = { render: () => null }
const makeRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/manage', name: 'my-championships', component: stub },
      {
        path: '/manage/:championshipId/participants',
        name: 'championship-participants',
        component: stub,
      },
    ],
  })

describe('OrganizerBreadcrumb', () => {
  it('links earlier items and marks the last one as the current page', () => {
    const wrapper = mount(OrganizerBreadcrumb, {
      props: {
        items: [
          { label: 'Meus campeonatos', to: { name: 'my-championships' } },
          { label: 'Copa 2026' },
          {
            label: 'Participantes',
            to: { name: 'championship-participants', params: { championshipId: 'c1' } },
          },
          { label: 'Novo participante', to: { name: 'my-championships' } },
        ],
      },
      global: { plugins: [makeRouter()] },
    })

    expect(wrapper.get('nav').attributes('aria-label')).toBe('Navegação estrutural')
    expect(wrapper.findAll('a').map((a) => [a.text(), a.attributes('href')])).toEqual([
      ['Meus campeonatos', '/manage'],
      ['Participantes', '/manage/c1/participants'],
    ])
    expect(wrapper.get('[aria-current="page"]').text()).toBe('Novo participante')
    expect(wrapper.findAll('li[aria-hidden="true"]')).toHaveLength(3)
  })
})

describe('LoadStatePanel', () => {
  const texts = {
    loadingText: 'Carregando…',
    errorText: 'Falhou.',
    notFoundText: 'Não encontrado.',
    back: { label: 'Voltar', to: '/manage' },
  }

  it('announces loading politely', () => {
    const wrapper = mount(LoadStatePanel, {
      props: { state: 'loading', ...texts },
      global: { plugins: [makeRouter()] },
    })

    expect(wrapper.get('[aria-live="polite"]').text()).toBe('Carregando…')
  })

  it('emits retry from the error alert', async () => {
    const wrapper = mount(LoadStatePanel, {
      props: { state: 'error', ...texts },
      global: { plugins: [makeRouter()] },
    })

    expect(wrapper.get('[role="alert"]').text()).toContain('Falhou.')
    await wrapper.get('[role="alert"] button').trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('offers a way back when not found', () => {
    const wrapper = mount(LoadStatePanel, {
      props: { state: 'not-found', ...texts },
      global: { plugins: [makeRouter()] },
    })

    expect(wrapper.text()).toContain('Não encontrado.')
    expect(wrapper.get('a').text()).toBe('Voltar')
    expect(wrapper.get('a').attributes('href')).toBe('/manage')
  })
})

describe('EmptyState', () => {
  it('renders the title, the text and an optional action', () => {
    const bare = mount(EmptyState, { props: { title: 'Nada aqui.', text: 'Ajuste a busca.' } })
    expect(bare.get('h2').text()).toBe('Nada aqui.')
    expect(bare.text()).toContain('Ajuste a busca.')
    expect(bare.find('button').exists()).toBe(false)

    const withAction = mount(EmptyState, {
      props: { title: 'Nada aqui.', text: 'Ajuste a busca.' },
      slots: { default: '<button type="button">Limpar busca</button>' },
    })
    expect(withAction.get('button').text()).toBe('Limpar busca')
  })
})

describe('OrganizerFooter', () => {
  it('flags demo data when the API is not configured', () => {
    const wrapper = mount(OrganizerFooter)

    expect(wrapper.text()).toContain('CROSSLISEU · UTFPR')
    expect(wrapper.text()).toContain('Conceito visual · dados demonstrativos')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd apps/web && npx vitest run src/views/organizer/components`
Expected: FAIL (components don't exist).

- [ ] **Step 3: Implement.** Append to `apps/web/src/styles/base.css`:

```css
/* Text for screen readers only, for labels Figma doesn't show */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
```

`apps/web/src/views/organizer/components/OrganizerBreadcrumb.vue`:

```vue
<script setup lang="ts">
// Breadcrumb of the per-championship organizer pages (Figma 09, 09b, 10, 10b). Earlier items
// with `to` are links; the last item is the current page.
import type { RouteLocationRaw } from 'vue-router'

defineProps<{ items: { label: string; to?: RouteLocationRaw }[] }>()
</script>

<template>
  <nav aria-label="Navegação estrutural">
    <ol class="organizer-breadcrumb text-mono-s">
      <template v-for="(item, index) in items" :key="index">
        <li v-if="index > 0" aria-hidden="true">/</li>
        <li :aria-current="index === items.length - 1 ? 'page' : undefined">
          <RouterLink
            v-if="item.to && index < items.length - 1"
            class="organizer-breadcrumb__link"
            :to="item.to"
          >
            {{ item.label }}
          </RouterLink>
          <template v-else>{{ item.label }}</template>
        </li>
      </template>
    </ol>
  </nav>
</template>

<style scoped>
.organizer-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--color-muted);
  text-transform: uppercase;
}

.organizer-breadcrumb__link {
  color: inherit;
  text-decoration: none;
}

.organizer-breadcrumb__link:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-orange);
  outline-offset: var(--focus-ring-offset);
  border-radius: var(--radius-xs);
}
</style>
```

`apps/web/src/views/organizer/components/OrganizerFooter.vue`:

```vue
<script setup lang="ts">
import { isApiEnabled } from '@/api/client'
</script>

<template>
  <footer class="organizer-footer text-mono-s">
    <p>CROSSLISEU · UTFPR</p>
    <p v-if="!isApiEnabled">Conceito visual · dados demonstrativos</p>
  </footer>
</template>

<style scoped>
.organizer-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-2);
  padding-top: var(--space-2);
  color: var(--color-muted);
}
</style>
```

`apps/web/src/views/organizer/components/LoadStatePanel.vue`:

```vue
<script setup lang="ts">
// Loading, failure and not-found states shared by the per-championship organizer pages
import type { RouteLocationRaw } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'

defineProps<{
  state: 'loading' | 'error' | 'not-found'
  loadingText: string
  errorText: string
  notFoundText: string
  /** Where "not found" sends the user */
  back: { label: string; to: RouteLocationRaw }
}>()

defineEmits<{ retry: [] }>()
</script>

<template>
  <p v-if="state === 'loading'" class="load-state__muted text-body-m" aria-live="polite">
    {{ loadingText }}
  </p>
  <div v-else-if="state === 'error'" class="load-state__error" role="alert">
    <p class="text-body-m">{{ errorText }}</p>
    <AppButton variant="secondary" @click="$emit('retry')">Tentar novamente</AppButton>
  </div>
  <div v-else class="load-state__not-found">
    <p class="load-state__muted text-body-m">{{ notFoundText }}</p>
    <AppButton variant="secondary" :to="back.to">{{ back.label }}</AppButton>
  </div>
</template>

<style scoped>
.load-state__muted {
  color: var(--color-muted);
}

.load-state__error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-6);
  border: 1px solid var(--color-red);
  border-radius: var(--radius-sm);
  background: var(--color-red-dim);
  color: var(--color-text);
}

.load-state__not-found {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
}
</style>
```

`apps/web/src/views/organizer/components/EmptyState.vue`:

```vue
<script setup lang="ts">
// Figma 09 empty state (node 22:487): dashed panel with a title, one line of help and an
// optional action. Its "ESTADO VAZIO" overline is a design annotation, not interface text.
defineProps<{ title: string; text: string }>()
</script>

<template>
  <section class="empty-state">
    <h2 class="empty-state__title text-heading-m">{{ title }}</h2>
    <p class="empty-state__text text-body-m">{{ text }}</p>
    <div v-if="$slots.default" class="empty-state__action">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-8) var(--space-6);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  text-align: center;
}

.empty-state__title {
  color: var(--color-text);
  text-transform: uppercase;
}

.empty-state__text {
  color: var(--color-muted);
}

.empty-state__action {
  padding-top: var(--space-2);
}
</style>
```

- [ ] **Step 4: Check the empty state against Figma.** Invoke `figma:figma-design-to-code`, then `get_design_context` once for node `22:487` (file key `kGzPxE42HygJmS0DEqQKwx`). Adjust paddings and gaps to the matching tokens. Report any value without a token instead of hardcoding it.

- [ ] **Step 5: Run tests, type-check, lint**

Run: `cd apps/web && npx vitest run src/views/organizer/components && npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/styles/base.css apps/web/src/views/organizer/components
git commit -m "feat(web): add shared organizer page blocks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Participantes list (Figma 09, node 22:336)

**Files:**
- Create: `apps/web/src/views/organizer/participants-list.ts`
- Create: `apps/web/src/views/organizer/__tests__/participants-list.spec.ts`
- Modify: `apps/web/src/components/ui/InputField.vue` (`hideLabel` prop)
- Modify (rewrite): `apps/web/src/views/organizer/ParticipantsView.vue`
- Create: `apps/web/src/views/organizer/__tests__/ParticipantsView.spec.ts`

**Interfaces:**
- Consumes: `getChampionship`, `getRobots`, `deleteRobot` from `@/mocks` and `weightClassLabel` from `@/utils/robot` (Task 6); routes `participant-create`, `participant-edit` (Task 7); blocks from Task 8.
- Produces: `participantsSubtitle(robots: Robot[]): string`, `filterRobots(robots: Robot[], query: string): Robot[]`, `REMOVE_MESSAGES`, `describeRemoveError(error: unknown, robotName: string): string`. `InputField` gains `hideLabel?: boolean`.

- [ ] **Step 1: Write the failing logic test** — `apps/web/src/views/organizer/__tests__/participants-list.spec.ts`

```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import type { Robot } from '@/types'
import {
  REMOVE_MESSAGES,
  describeRemoveError,
  filterRobots,
  participantsSubtitle,
} from '../participants-list'

const robot = (name: string, team: string): Robot => ({
  id: name,
  championshipId: 'c1',
  name,
  team,
  weightClass: 'lightweight',
  createdAt: '',
  modifiedAt: '',
})

const robots = [robot('Titã', 'Equipe Volt'), robot('Aço', 'Equipe Aço'), robot('Marte', 'equipe volt')]

describe('participantsSubtitle', () => {
  it('counts robots and distinct teams, ignoring case', () => {
    expect(participantsSubtitle(robots)).toBe('3 robôs inscritos · 2 equipes')
  })

  it('uses singulars', () => {
    expect(participantsSubtitle([robots[0]!])).toBe('1 robô inscrito · 1 equipe')
  })
})

describe('filterRobots', () => {
  it('returns everything for a blank query', () => {
    expect(filterRobots(robots, '   ')).toBe(robots)
  })

  it('matches the robot name or the team, ignoring case and accents', () => {
    expect(filterRobots(robots, 'ACO').map((r) => r.name)).toEqual(['Aço'])
    expect(filterRobots(robots, ' volt ').map((r) => r.name)).toEqual(['Titã', 'Marte'])
    expect(filterRobots(robots, 'tita').map((r) => r.name)).toEqual(['Titã'])
    expect(filterRobots(robots, 'zzz')).toEqual([])
  })
})

describe('describeRemoveError', () => {
  it('explains a robot that is in a match', () => {
    const error = new ApiError(409, 'robot_has_matches', ['robot_has_matches'])
    expect(describeRemoveError(error, 'Titã')).toBe(REMOVE_MESSAGES.hasMatches('Titã'))
  })

  it('handles network and unknown failures', () => {
    expect(describeRemoveError(new ApiError(0, 'Failed to fetch'), 'Titã')).toBe(
      REMOVE_MESSAGES.noConnection,
    )
    expect(describeRemoveError(new Error('boom'), 'Titã')).toBe(REMOVE_MESSAGES.generic('Titã'))
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd apps/web && npx vitest run src/views/organizer/__tests__/participants-list.spec.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `apps/web/src/views/organizer/participants-list.ts`

```ts
// Pure logic for ParticipantsView (Figma 09)
import { ApiError } from '@/api/client'
import type { Robot } from '@/types'

const numberFormat = new Intl.NumberFormat('pt-BR')

const count = (value: number, one: string, many: string) =>
  `${numberFormat.format(value)} ${value === 1 ? one : many}`

/** "16 robôs inscritos · 9 equipes". Teams are counted ignoring case. */
export function participantsSubtitle(robots: Robot[]): string {
  const teams = new Set(robots.map((r) => r.team.toLocaleLowerCase('pt-BR')))
  return `${count(robots.length, 'robô inscrito', 'robôs inscritos')} · ${count(teams.size, 'equipe', 'equipes')}`
}

// Lowercase without accents, so "aco" finds "Aço"
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR')

/** "Buscar robô ou equipe": matches the robot name or the team, ignoring case and accents */
export function filterRobots(robots: Robot[], query: string): Robot[] {
  const needle = fold(query.trim())
  if (!needle) return robots
  return robots.filter((r) => fold(r.name).includes(needle) || fold(r.team).includes(needle))
}

export const REMOVE_MESSAGES = {
  hasMatches: (name: string) =>
    `Não foi possível remover ${name}: o robô está em lutas do campeonato.`,
  noConnection: 'Não foi possível conectar ao servidor. Tente novamente.',
  generic: (name: string) => `Não foi possível remover ${name}. Tente novamente.`,
}

/** Inline message after "Remover" fails */
export function describeRemoveError(error: unknown, robotName: string): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return REMOVE_MESSAGES.noConnection
    if (error.details.includes('robot_has_matches')) return REMOVE_MESSAGES.hasMatches(robotName)
  }
  return REMOVE_MESSAGES.generic(robotName)
}
```

Run: `cd apps/web && npx vitest run src/views/organizer/__tests__/participants-list.spec.ts`
Expected: PASS.

- [ ] **Step 4: Let `InputField` hide its label.** Figma 09's search field has no visible label. In `apps/web/src/components/ui/InputField.vue`, add `hideLabel = false` to the destructured props and to the type (`/** Keeps the label for screen readers only */ hideLabel?: boolean`), and change the label to:

```vue
    <label
      class="input-field__label text-label-s"
      :class="{ 'visually-hidden': hideLabel }"
      :for="id"
    >
      {{ label }}
    </label>
```

- [ ] **Step 5: Write the failing view test** — `apps/web/src/views/organizer/__tests__/ParticipantsView.spec.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import { TOKEN_STORAGE_KEY } from '@/stores/auth'
import { liveToken } from '@/stores/__tests__/token-helpers'
import type { Championship, Robot } from '@/types'
import ParticipantsView from '../ParticipantsView.vue'

vi.mock('@/mocks', () => ({
  getChampionship: vi.fn<(id: string) => Promise<Championship | null>>(),
  getRobots: vi.fn<(championshipId: string) => Promise<Robot[]>>(),
  deleteRobot: vi.fn<(id: string, token: string) => Promise<void>>(),
}))
import { deleteRobot, getChampionship, getRobots } from '@/mocks'

const stub = { render: () => null }
const base = { createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' }
const championship: Championship = { ...base, id: 'c1', name: 'Copa 2026', startDate: '2026-12-09' }
const robot = (id: string, name: string, team: string, weightClass = 'lightweight'): Robot => ({
  ...base,
  id,
  championshipId: 'c1',
  name,
  team,
  weightClass,
})
const fixture = () => [
  robot('r1', 'Titã', 'Equipe Volt'),
  robot('r2', 'Aço', 'Equipe Aço'),
  robot('r3', 'Marte', 'Equipe Volt', 'heavyweight'),
]

let token = ''
let confirmSpy: ReturnType<typeof vi.spyOn>

async function mountView(path = '/manage/c1/participants') {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/manage', name: 'my-championships', component: stub },
      {
        path: '/manage/:championshipId/participants',
        name: 'championship-participants',
        component: ParticipantsView,
        props: true,
      },
      {
        path: '/manage/:championshipId/participants/new',
        name: 'participant-create',
        component: stub,
      },
      {
        path: '/manage/:championshipId/participants/:robotId/edit',
        name: 'participant-edit',
        component: stub,
      },
    ],
  })
  await router.push(path)
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

type Wrapper = Awaited<ReturnType<typeof mountView>>['wrapper']

const rowNames = (wrapper: Wrapper) => wrapper.findAll('tbody th').map((th) => th.text())
const removeButton = (wrapper: Wrapper, name: string) =>
  wrapper.findAll('button').find((b) => b.attributes('aria-label') === `Remover ${name}`)!

describe('ParticipantsView', () => {
  beforeEach(() => {
    localStorage.clear()
    token = liveToken()
    vi.mocked(getChampionship).mockReset().mockResolvedValue(championship)
    vi.mocked(getRobots).mockReset().mockResolvedValue(fixture())
    vi.mocked(deleteRobot).mockReset().mockResolvedValue(undefined)
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  })
  afterEach(() => {
    confirmSpy.mockRestore()
  })

  it('lists robots with team and weight class and counts robots and teams', async () => {
    const { wrapper } = await mountView()

    expect(rowNames(wrapper)).toEqual(['Titã', 'Aço', 'Marte'])
    const marte = wrapper.findAll('tbody tr')[2]!
    expect(marte.text()).toContain('Equipe Volt')
    expect(marte.text()).toContain('Peso pesado')
    expect(wrapper.text()).toContain('3 robôs inscritos · 2 equipes')
    expect(wrapper.findAll('nav li:not([aria-hidden])').map((li) => li.text())).toEqual([
      'Meus campeonatos',
      'Copa 2026',
      'Participantes',
    ])
  })

  it('links to the create and edit forms', async () => {
    const { wrapper } = await mountView()
    const links = wrapper.findAll('a')

    expect(links.find((a) => a.text() === 'Adicionar participante')!.attributes('href')).toBe(
      '/manage/c1/participants/new',
    )
    expect(links.find((a) => a.attributes('aria-label') === 'Editar Titã')!.attributes('href')).toBe(
      '/manage/c1/participants/r1/edit',
    )
  })

  it('filters by robot or team and clears the search', async () => {
    const { wrapper } = await mountView()
    const search = wrapper.get<HTMLInputElement>('input[type="search"]')

    await search.setValue('aco')
    expect(rowNames(wrapper)).toEqual(['Aço'])

    await search.setValue('volt')
    expect(rowNames(wrapper)).toEqual(['Titã', 'Marte'])

    await search.setValue('zzz')
    expect(wrapper.text()).toContain('Nenhum participante corresponde a essa busca.')
    await wrapper.findAll('button').find((b) => b.text() === 'Limpar busca')!.trigger('click')
    expect(search.element.value).toBe('')
    expect(rowNames(wrapper)).toHaveLength(3)
  })

  it('labels the search field for screen readers only', async () => {
    const { wrapper } = await mountView()
    const label = wrapper.get('label')

    expect(label.text()).toBe('Buscar participantes')
    expect(label.classes()).toContain('visually-hidden')
    expect(wrapper.get('input[type="search"]').attributes('placeholder')).toBe(
      'Buscar robô ou equipe',
    )
  })

  it('shows an empty state without robots', async () => {
    vi.mocked(getRobots).mockResolvedValue([])
    const { wrapper } = await mountView()

    expect(wrapper.text()).toContain('Nenhum participante inscrito.')
    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.find('input[type="search"]').exists()).toBe(false)
  })

  it('removes a robot only after confirming', async () => {
    const { wrapper } = await mountView()

    confirmSpy.mockReturnValueOnce(false)
    await removeButton(wrapper, 'Aço').trigger('click')
    expect(deleteRobot).not.toHaveBeenCalled()

    await removeButton(wrapper, 'Aço').trigger('click')
    await flushPromises()
    expect(confirmSpy).toHaveBeenLastCalledWith(
      'Remover Aço do campeonato? Essa ação não pode ser desfeita.',
    )
    expect(deleteRobot).toHaveBeenCalledWith('r2', token)
    expect(rowNames(wrapper)).toEqual(['Titã', 'Marte'])
  })

  it('sends one request when Remover is clicked twice', async () => {
    let resolve: () => void = () => {}
    vi.mocked(deleteRobot).mockReturnValue(new Promise<void>((r) => (resolve = r)))
    const { wrapper } = await mountView()

    await removeButton(wrapper, 'Aço').trigger('click')
    await removeButton(wrapper, 'Titã').trigger('click')

    expect(deleteRobot).toHaveBeenCalledTimes(1)
    resolve()
    await flushPromises()
  })

  it('keeps the row and explains when the robot is in a match', async () => {
    vi.mocked(deleteRobot).mockRejectedValue(
      new ApiError(409, 'robot_has_matches', ['robot_has_matches']),
    )
    const { wrapper } = await mountView()

    await removeButton(wrapper, 'Titã').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Não foi possível remover Titã: o robô está em lutas do campeonato.',
    )
    expect(rowNames(wrapper)).toContain('Titã')
  })

  it('drops a robot that was already removed elsewhere', async () => {
    vi.mocked(deleteRobot).mockRejectedValue(
      new ApiError(404, 'robot_not_found', ['robot_not_found']),
    )
    const { wrapper } = await mountView()

    await removeButton(wrapper, 'Titã').trigger('click')
    await flushPromises()

    expect(rowNames(wrapper)).toEqual(['Aço', 'Marte'])
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows not found for an unknown championship without listing robots', async () => {
    vi.mocked(getChampionship).mockResolvedValue(null)
    const { wrapper } = await mountView('/manage/nope/participants')

    expect(wrapper.text()).toContain('Campeonato não encontrado.')
    expect(getRobots).not.toHaveBeenCalled()
  })

  it('shows a retry panel when loading fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getRobots).mockRejectedValueOnce(new Error('boom'))
    const { wrapper } = await mountView()

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Não foi possível carregar os participantes.',
    )
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()

    expect(rowNames(wrapper)).toHaveLength(3)
    error.mockRestore()
  })
})
```

- [ ] **Step 6: Run and watch it fail**

Run: `cd apps/web && npx vitest run src/views/organizer/__tests__/ParticipantsView.spec.ts`
Expected: FAIL (the placeholder renders only a heading).

- [ ] **Step 7: Fetch the design once.** Invoke `figma:figma-design-to-code`, then `get_design_context` for node `22:336` and `get_screenshot` for the same node (file key `kGzPxE42HygJmS0DEqQKwx`). Use them to check the CSS below; don't paste the React output.

- [ ] **Step 8: Implement** — replace `apps/web/src/views/organizer/ParticipantsView.vue` with:

```vue
<script setup lang="ts">
// Figma: `09 / Organizador · Participantes` (node 22:336), empty state 22:487. The API has only
// name, team and weight class, so the Aptos/Pendentes tabs, the combat category and
// "responsável" are not built. "Categoria" shows the weight class label ("Peso leve").
import { computed, ref, watch } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import InputField from '@/components/ui/InputField.vue'
import { ApiError } from '@/api/client'
import { deleteRobot, getChampionship, getRobots } from '@/mocks'
import { useAuthStore } from '@/stores/auth'
import type { Robot } from '@/types'
import { weightClassLabel } from '@/utils/robot'
import EmptyState from './components/EmptyState.vue'
import LoadStatePanel from './components/LoadStatePanel.vue'
import OrganizerBreadcrumb from './components/OrganizerBreadcrumb.vue'
import OrganizerFooter from './components/OrganizerFooter.vue'
import { describeRemoveError, filterRobots, participantsSubtitle } from './participants-list'

const { championshipId } = defineProps<{ championshipId: string }>()

const auth = useAuthStore()

const loadState = ref<'loading' | 'ready' | 'not-found' | 'error'>('loading')
const championshipName = ref('')
const robots = ref<Robot[]>([])
const search = ref('')
const removingId = ref<string | null>(null)
const removeError = ref<string | null>(null)

// Single data entry point for this view
async function load() {
  // The component is reused when the id changes: only the latest request may write state
  const requestedId = championshipId
  loadState.value = 'loading'
  removeError.value = null
  try {
    // Championship first: a malformed id is "not found" here, while GET /robots would reject it
    const championship = await getChampionship(requestedId)
    if (requestedId !== championshipId) return
    if (!championship) {
      loadState.value = 'not-found'
      return
    }
    const loaded = await getRobots(requestedId)
    if (requestedId !== championshipId) return
    championshipName.value = championship.name
    robots.value = loaded
    loadState.value = 'ready'
  } catch (error) {
    if (requestedId !== championshipId) return
    console.error('Failed to load participants', error)
    loadState.value = 'error'
  }
}
watch(() => championshipId, load, { immediate: true })

const visible = computed(() => filterRobots(robots.value, search.value))
const subtitle = computed(() => participantsSubtitle(robots.value))
const breadcrumb = computed(() => [
  { label: 'Meus campeonatos', to: { name: 'my-championships' } },
  ...(championshipName.value ? [{ label: championshipName.value }] : []),
  { label: 'Participantes' },
])

async function remove(robot: Robot) {
  if (removingId.value) return
  if (!window.confirm(`Remover ${robot.name} do campeonato? Essa ação não pode ser desfeita.`)) {
    return
  }
  removingId.value = robot.id
  removeError.value = null
  try {
    await deleteRobot(robot.id, auth.token ?? '')
    robots.value = robots.value.filter((r) => r.id !== robot.id)
  } catch (error) {
    // Already removed elsewhere: the list just catches up
    if (error instanceof ApiError && error.status === 404) {
      robots.value = robots.value.filter((r) => r.id !== robot.id)
      return
    }
    removeError.value = describeRemoveError(error, robot.name)
  } finally {
    removingId.value = null
  }
}
</script>

<template>
  <div class="participants">
    <OrganizerBreadcrumb :items="breadcrumb" />

    <header class="participants__header">
      <div class="participants__titles">
        <h1 class="participants__title text-display-page">Participantes</h1>
        <p v-if="loadState === 'ready'" class="participants__muted text-body-m">{{ subtitle }}</p>
      </div>
      <AppButton
        v-if="loadState === 'ready'"
        class="participants__add"
        :to="{ name: 'participant-create', params: { championshipId } }"
      >
        Adicionar participante
      </AppButton>
    </header>

    <LoadStatePanel
      v-if="loadState !== 'ready'"
      :state="loadState"
      loading-text="Carregando participantes…"
      error-text="Não foi possível carregar os participantes."
      not-found-text="Campeonato não encontrado."
      :back="{ label: 'Voltar para meus campeonatos', to: { name: 'my-championships' } }"
      @retry="load"
    />

    <EmptyState
      v-else-if="robots.length === 0"
      title="Nenhum participante inscrito."
      text="Use “Adicionar participante” para cadastrar o primeiro robô."
    />

    <template v-else>
      <InputField
        v-model="search"
        type="search"
        name="search"
        label="Buscar participantes"
        hide-label
        placeholder="Buscar robô ou equipe"
      />

      <div v-if="removeError" class="participants__banner" role="alert">
        <span class="participants__banner-dot" aria-hidden="true" />
        <p class="participants__banner-text text-body-s">{{ removeError }}</p>
      </div>

      <EmptyState
        v-if="visible.length === 0"
        title="Nenhum participante corresponde a essa busca."
        text="Ajuste a busca ou cadastre um novo participante."
      >
        <AppButton variant="secondary" @click="search = ''">Limpar busca</AppButton>
      </EmptyState>

      <div v-else class="participants__card">
        <table class="participants__table">
          <thead class="text-overline">
            <tr>
              <th scope="col">Robô</th>
              <th scope="col">Equipe</th>
              <th scope="col">Categoria</th>
              <th scope="col"><span class="visually-hidden">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="robot in visible" :key="robot.id">
              <th scope="row" class="participants__robot text-heading-s">{{ robot.name }}</th>
              <td class="participants__team text-body-m">{{ robot.team }}</td>
              <td class="participants__weight text-mono-s">
                {{ weightClassLabel(robot.weightClass) }}
              </td>
              <td>
                <div class="participants__actions">
                  <AppButton
                    variant="secondary"
                    :to="{ name: 'participant-edit', params: { championshipId, robotId: robot.id } }"
                    :aria-label="`Editar ${robot.name}`"
                  >
                    Editar
                  </AppButton>
                  <AppButton
                    variant="destructive"
                    :disabled="removingId !== null"
                    :aria-busy="removingId === robot.id"
                    :aria-label="`Remover ${robot.name}`"
                    @click="remove(robot)"
                  >
                    Remover
                  </AppButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <OrganizerFooter />
  </div>
</template>

<style scoped>
.participants {
  display: flex;
  flex-direction: column;
  gap: var(--space-28px);
}

.participants__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.participants__titles {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.participants__title {
  color: var(--color-text);
  text-transform: uppercase;
}

.participants__muted {
  color: var(--color-muted);
}

.participants__add {
  min-height: var(--size-control-lg);
}

.participants__banner {
  display: flex;
  align-items: center;
  gap: var(--space-10px);
  padding: var(--space-3) var(--space-14px);
  border: 1px solid var(--color-red);
  border-radius: var(--radius-sm);
  background: var(--color-red-dim);
}

.participants__banner-dot {
  flex-shrink: 0;
  width: var(--size-dot);
  height: var(--size-dot);
  border-radius: var(--radius-pill);
  background: var(--color-red);
}

.participants__banner-text {
  min-width: 0;
  color: var(--color-red);
}

/* The card may scroll on very narrow screens; the page itself never scrolls sideways */
.participants__card {
  overflow-x: auto;
  padding: var(--space-2) var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.participants__table {
  width: 100%;
  border-collapse: collapse;
}

.participants__table th,
.participants__table td {
  padding: var(--space-4) var(--space-3) var(--space-4) 0;
  border-bottom: 1px solid var(--color-border-soft);
  text-align: left;
  vertical-align: middle;
  overflow-wrap: anywhere;
}

.participants__table tbody tr:last-child > * {
  border-bottom: none;
}

.participants__table thead th {
  color: var(--color-muted);
  font-weight: inherit;
}

.participants__robot {
  color: var(--color-text);
  text-transform: uppercase;
}

.participants__team,
.participants__weight {
  color: var(--color-muted);
}

.participants__weight {
  white-space: nowrap;
}

.participants__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-3);
}
</style>
```

- [ ] **Step 9: Run tests, type-check, lint**

Run: `cd apps/web && npx vitest run && npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 10: Compare with Figma.** Run `npm run dev` with `VITE_API_URL` unset, sign in as `organizador` / `crossliseu`, open `/manage/6f1c2a40-0001-4000-8000-000000000001/participants`, and compare with the screenshot from Step 7. Fix token-level differences. In your report, list the deliberate ones (no tabs, no category text, no "responsável", search placeholder) and anything you couldn't match.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/components/ui/InputField.vue apps/web/src/views/organizer/ParticipantsView.vue apps/web/src/views/organizer/participants-list.ts apps/web/src/views/organizer/__tests__/participants-list.spec.ts apps/web/src/views/organizer/__tests__/ParticipantsView.spec.ts
git commit -m "feat(web): build the participants list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: `SelectField` (Figma `Select / Menu` 126:663 and `Select / Option` 126:666)

**Files:**
- Create: `apps/web/src/components/ui/select-field.ts`
- Create: `apps/web/src/components/ui/SelectField.vue`
- Create: `apps/web/src/components/ui/__tests__/SelectField.spec.ts`
- Modify: `apps/web/src/styles/tokens.css`
- Modify: `apps/web/src/views/dev/ComponentsPreviewView.vue`
- Modify: `apps/web/CLAUDE.md`

**Interfaces:**
- Produces:
  - `interface SelectOption { value: string; label: string; meta?: string; disabled?: boolean; disabledReason?: string }` from `@/components/ui/select-field`
  - `stepEnabled(options, from: number, direction: 1 | -1): number`, `firstEnabled(options, fromEnd = false): number` (−1 when none is enabled)
  - `<SelectField v-model="id" label options group-label? placeholder? hint? error? disabled? required? />`. Renders `role="combobox"` (focusable trigger) controlling a `role="listbox"` of `role="option"` items with `aria-selected`/`aria-disabled`. A disabled option shows `disabledReason` in place of `meta`. Attributes such as `class` and `@focusout` fall through to the root.
  - Tokens `--z-menu`, `--size-menu-max`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/components/ui/__tests__/SelectField.spec.ts`

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import SelectField from '../SelectField.vue'
import { firstEnabled, stepEnabled, type SelectOption } from '../select-field'

const options: SelectOption[] = [
  { value: 'tita', label: 'Titã', meta: 'Equipe Volt · Peso leve' },
  {
    value: 'marte',
    label: 'Marte',
    meta: 'Equipe Órbita · Peso leve',
    disabled: true,
    disabledReason: 'Já escolhido como Robô 1',
  },
  { value: 'aco', label: 'Aço', meta: 'Equipe Aço · Peso leve' },
]

const mounted: { unmount: () => void }[] = []
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
})

function mountSelect(
  props: Partial<{
    modelValue: string
    placeholder: string
    hint: string
    error: string
    disabled: boolean
  }> = {},
) {
  const wrapper = mount(SelectField, {
    props: { label: 'Robô 2 *', options, groupLabel: 'Participantes · Peso leve', ...props },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  return wrapper
}

type Wrapper = ReturnType<typeof mountSelect>

const combobox = (wrapper: Wrapper) => wrapper.get('[role="combobox"]')
const optionEls = (wrapper: Wrapper) => wrapper.findAll('[role="option"]')
const activeId = (wrapper: Wrapper) => combobox(wrapper).attributes('aria-activedescendant')
const emitted = (wrapper: Wrapper) =>
  (wrapper.emitted('update:modelValue') ?? []).map(([value]) => value)

describe('select-field helpers', () => {
  it('steps over disabled options without wrapping', () => {
    expect(stepEnabled(options, 0, 1)).toBe(2)
    expect(stepEnabled(options, 2, -1)).toBe(0)
    expect(stepEnabled(options, 2, 1)).toBe(2)
    expect(firstEnabled(options)).toBe(0)
    expect(firstEnabled(options, true)).toBe(2)
    expect(firstEnabled([{ value: 'x', label: 'X', disabled: true }])).toBe(-1)
  })
})

describe('SelectField', () => {
  it('starts closed and shows the label and the placeholder', () => {
    const wrapper = mountSelect({ placeholder: 'Escolha um robô' })

    expect(wrapper.text()).toContain('Robô 2 *')
    expect(combobox(wrapper).text()).toContain('Escolha um robô')
    expect(combobox(wrapper).attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('[role="listbox"]').isVisible()).toBe(false)
  })

  it('opens on click with the group label, the metas and the disabled reason', async () => {
    const wrapper = mountSelect()

    await combobox(wrapper).trigger('click')

    expect(combobox(wrapper).attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('[role="listbox"]').isVisible()).toBe(true)
    expect(wrapper.text()).toContain('Participantes · Peso leve')
    const [tita, marte] = optionEls(wrapper)
    expect(tita!.text()).toContain('Equipe Volt · Peso leve')
    expect(marte!.attributes('aria-disabled')).toBe('true')
    expect(marte!.text()).toContain('Já escolhido como Robô 1')
    expect(marte!.text()).not.toContain('Equipe Órbita')
  })

  it('moves with the arrows, skipping disabled options, and picks with Enter', async () => {
    const wrapper = mountSelect()

    await combobox(wrapper).trigger('keydown', { key: 'ArrowDown' })
    expect(combobox(wrapper).attributes('aria-expanded')).toBe('true')
    expect(activeId(wrapper)).toBe(optionEls(wrapper)[0]!.attributes('id'))

    await combobox(wrapper).trigger('keydown', { key: 'ArrowDown' })
    expect(activeId(wrapper)).toBe(optionEls(wrapper)[2]!.attributes('id'))

    await combobox(wrapper).trigger('keydown', { key: 'Enter' })
    expect(emitted(wrapper)).toEqual(['aco'])
    expect(combobox(wrapper).attributes('aria-expanded')).toBe('false')
  })

  it('supports Space, Home and End', async () => {
    const wrapper = mountSelect()

    await combobox(wrapper).trigger('keydown', { key: ' ' })
    await combobox(wrapper).trigger('keydown', { key: 'End' })
    expect(activeId(wrapper)).toBe(optionEls(wrapper)[2]!.attributes('id'))
    await combobox(wrapper).trigger('keydown', { key: 'Home' })
    expect(activeId(wrapper)).toBe(optionEls(wrapper)[0]!.attributes('id'))
    await combobox(wrapper).trigger('keydown', { key: ' ' })

    expect(emitted(wrapper)).toEqual(['tita'])
  })

  it('closes with Escape without changing the value', async () => {
    const wrapper = mountSelect({ modelValue: 'tita' })

    await combobox(wrapper).trigger('click')
    await combobox(wrapper).trigger('keydown', { key: 'ArrowDown' })
    await combobox(wrapper).trigger('keydown', { key: 'Escape' })

    expect(combobox(wrapper).attributes('aria-expanded')).toBe('false')
    expect(emitted(wrapper)).toEqual([])
  })

  it('shows and marks the selected option, and opens on it', async () => {
    const wrapper = mountSelect({ modelValue: 'aco' })

    expect(combobox(wrapper).text()).toContain('Aço')
    await combobox(wrapper).trigger('click')

    expect(activeId(wrapper)).toBe(optionEls(wrapper)[2]!.attributes('id'))
    expect(optionEls(wrapper).map((o) => o.attributes('aria-selected'))).toEqual([
      'false',
      'false',
      'true',
    ])
  })

  it('picks an option by click and ignores disabled ones', async () => {
    const wrapper = mountSelect()

    await combobox(wrapper).trigger('click')
    await optionEls(wrapper)[1]!.trigger('click')
    expect(emitted(wrapper)).toEqual([])
    expect(combobox(wrapper).attributes('aria-expanded')).toBe('true')

    await optionEls(wrapper)[0]!.trigger('click')
    expect(emitted(wrapper)).toEqual(['tita'])
    expect(combobox(wrapper).attributes('aria-expanded')).toBe('false')
  })

  it('closes when the user presses outside', async () => {
    const wrapper = mountSelect()

    await combobox(wrapper).trigger('click')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(combobox(wrapper).attributes('aria-expanded')).toBe('false')
  })

  it('shows the error instead of the hint and marks the field invalid', () => {
    const wrapper = mountSelect({ hint: 'Equipe Bigorna · Peso pesado', error: 'Escolha o robô 2.' })
    const describedBy = combobox(wrapper).attributes('aria-describedby')!

    expect(combobox(wrapper).attributes('aria-invalid')).toBe('true')
    expect(wrapper.get(`[id="${describedBy}"]`).text()).toBe('Escolha o robô 2.')
    expect(wrapper.text()).not.toContain('Equipe Bigorna · Peso pesado')
  })

  it('does not open while disabled', async () => {
    const wrapper = mountSelect({ disabled: true })

    expect(combobox(wrapper).attributes('tabindex')).toBe('-1')
    expect(combobox(wrapper).attributes('aria-disabled')).toBe('true')
    await combobox(wrapper).trigger('click')
    await combobox(wrapper).trigger('keydown', { key: 'ArrowDown' })

    expect(combobox(wrapper).attributes('aria-expanded')).toBe('false')
  })

  it('names the combobox after the field and the listbox after the field and group', () => {
    const wrapper = mountSelect()
    const ids = wrapper.get('[role="listbox"]').attributes('aria-labelledby')!.split(' ')

    expect(ids.map((id) => wrapper.get(`[id="${id}"]`).text())).toEqual([
      'Robô 2 *',
      'Participantes · Peso leve',
    ])
    expect(combobox(wrapper).attributes('aria-labelledby')).toBe(ids[0])
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd apps/web && npx vitest run src/components/ui/__tests__/SelectField.spec.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Fetch the design once.** Invoke `figma:figma-design-to-code`, then `get_design_context` for `126:663` and `126:666`, and `get_screenshot` for `126:663`. Check the paddings, radius, colors and type styles in the CSS below against them.

- [ ] **Step 4: Add the two tokens** to `apps/web/src/styles/tokens.css`. In the Sizes block add `--size-menu-max: 320px; /* select menu height before it scrolls */`. After the Radius block add:

```css
  /* Layers */
  --z-menu: 10; /* open select menus sit above the rest of the form */
```

- [ ] **Step 5: Implement the helpers** — `apps/web/src/components/ui/select-field.ts`

```ts
// Types and keyboard helpers for SelectField (Figma `Select / Menu` 126:663, `Select / Option`
// 126:666)

export interface SelectOption {
  value: string
  label: string
  /** Muted text on the right, e.g. "Equipe Volt · Peso leve" */
  meta?: string
  disabled?: boolean
  /** Shown in place of `meta` while disabled, e.g. "Já escolhido como Robô 1" */
  disabledReason?: string
}

/** Next enabled index after `from` in `direction`; stays on `from` at either end (no wrap) */
export function stepEnabled(
  options: readonly SelectOption[],
  from: number,
  direction: 1 | -1,
): number {
  for (let index = from + direction; index >= 0 && index < options.length; index += direction) {
    if (!options[index]!.disabled) return index
  }
  return from
}

/** First (or last) enabled index, or -1 when every option is disabled */
export function firstEnabled(options: readonly SelectOption[], fromEnd = false): number {
  const index = fromEnd
    ? stepEnabled(options, options.length, -1)
    : stepEnabled(options, -1, 1)
  return index >= 0 && index < options.length ? index : -1
}
```

- [ ] **Step 6: Implement the component** — `apps/web/src/components/ui/SelectField.vue`

```vue
<script setup lang="ts">
// Figma: `Select / Menu` (126:663) and `Select / Option` (126:666), used by frame 10b. A
// select-only combobox (WAI-ARIA APG): focus stays on the trigger, which points at the active
// option with aria-activedescendant. No hover styles: the active option gets an inset ring for
// keyboard users, and the selected one gets the orange-dim background and a check.
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { firstEnabled, stepEnabled, type SelectOption } from './select-field'

const {
  label,
  options,
  groupLabel,
  placeholder = 'Selecione',
  hint,
  error,
  disabled = false,
  required = false,
} = defineProps<{
  label: string
  options: readonly SelectOption[]
  /** Overline above the options, e.g. "Participantes · Peso leve" */
  groupLabel?: string
  placeholder?: string
  hint?: string
  error?: string
  disabled?: boolean
  required?: boolean
}>()

const model = defineModel<string>({ default: '' })

const id = useId()
const labelId = `${id}-label`
const listboxId = `${id}-listbox`
const groupId = `${id}-group`
const hintId = `${id}-hint`
const errorId = `${id}-error`
const optionId = (index: number) => `${id}-option-${index}`

const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLElement | null>(null)
const open = ref(false)
const activeIndex = ref(-1)

const selectedIndex = computed(() => options.findIndex((option) => option.value === model.value))
const selected = computed(() => options[selectedIndex.value])
const describedBy = computed(() => (error ? errorId : hint ? hintId : undefined))
const listboxLabelledBy = computed(() => (groupLabel ? `${labelId} ${groupId}` : labelId))
const metaOf = (option: SelectOption) =>
  option.disabled ? (option.disabledReason ?? option.meta) : option.meta

function openMenu() {
  if (disabled) return
  open.value = true
  const current = selectedIndex.value
  activeIndex.value = current >= 0 && !options[current]!.disabled ? current : firstEnabled(options)
}

function close() {
  open.value = false
  activeIndex.value = -1
}

function choose(index: number) {
  const option = options[index]
  if (!option || option.disabled) return
  model.value = option.value
  close()
}

function onKeydown(event: KeyboardEvent) {
  if (disabled) return
  if (!open.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      openMenu()
    }
    return
  }
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      activeIndex.value = stepEnabled(options, activeIndex.value, 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      activeIndex.value = stepEnabled(options, activeIndex.value, -1)
      break
    case 'Home':
      event.preventDefault()
      activeIndex.value = firstEnabled(options)
      break
    case 'End':
      event.preventDefault()
      activeIndex.value = firstEnabled(options, true)
      break
    case 'Enter':
    case ' ':
      event.preventDefault()
      choose(activeIndex.value)
      break
    case 'Escape':
      event.preventDefault()
      close()
      break
    case 'Tab':
      close()
      break
  }
}

// Pressing anywhere outside the field closes the menu
function onDocumentPointerDown(event: Event) {
  if (!root.value?.contains(event.target as Node)) close()
}
watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('pointerdown', onDocumentPointerDown)
  else document.removeEventListener('pointerdown', onDocumentPointerDown)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))

function onFocusOut(event: FocusEvent) {
  if (!root.value?.contains(event.relatedTarget as Node | null)) close()
}
</script>

<template>
  <div
    ref="root"
    class="select-field"
    :class="{
      'select-field--open': open,
      'select-field--error': error,
      'select-field--disabled': disabled,
    }"
    @focusout="onFocusOut"
  >
    <span :id="labelId" class="select-field__label text-label-s" @click="trigger?.focus()">
      {{ label }}
    </span>
    <div class="select-field__control">
      <div
        ref="trigger"
        class="select-field__trigger text-body-m"
        role="combobox"
        :tabindex="disabled ? -1 : 0"
        aria-haspopup="listbox"
        :aria-labelledby="labelId"
        :aria-controls="listboxId"
        :aria-expanded="open ? 'true' : 'false'"
        :aria-activedescendant="open && activeIndex >= 0 ? optionId(activeIndex) : undefined"
        :aria-required="required ? 'true' : undefined"
        :aria-invalid="error ? 'true' : undefined"
        :aria-disabled="disabled ? 'true' : undefined"
        :aria-describedby="describedBy"
        @click="open ? close() : openMenu()"
        @keydown="onKeydown"
      >
        <span
          class="select-field__value"
          :class="{ 'select-field__value--placeholder': !selected }"
        >
          {{ selected?.label ?? placeholder }}
        </span>
        <svg class="select-field__icon select-field__chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>

      <div v-show="open" class="select-field__menu">
        <p v-if="groupLabel" :id="groupId" class="select-field__group text-overline">
          {{ groupLabel }}
        </p>
        <ul
          :id="listboxId"
          class="select-field__list"
          role="listbox"
          :aria-labelledby="listboxLabelledBy"
        >
          <li
            v-for="(option, index) in options"
            :id="optionId(index)"
            :key="option.value"
            class="select-field__option"
            :class="{ 'select-field__option--active': index === activeIndex }"
            role="option"
            :aria-selected="option.value === model ? 'true' : 'false'"
            :aria-disabled="option.disabled ? 'true' : undefined"
            @mousedown.prevent
            @click="choose(index)"
          >
            <span class="select-field__option-label text-heading-s">{{ option.label }}</span>
            <span v-if="metaOf(option)" class="select-field__option-meta text-body-s">
              {{ metaOf(option) }}
            </span>
            <svg
              v-if="option.value === model"
              class="select-field__icon"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path
                d="M3.5 8.5l3 3 6-7"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </li>
        </ul>
      </div>
    </div>
    <p v-if="error" :id="errorId" class="select-field__message select-field__error text-body-s">
      {{ error }}
    </p>
    <p v-else-if="hint" :id="hintId" class="select-field__message text-body-s">{{ hint }}</p>
  </div>
</template>

<style scoped>
.select-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  min-width: 0;
}

.select-field__label {
  color: var(--color-muted);
}

.select-field__control {
  position: relative;
}

.select-field__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  height: var(--size-field);
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-raised);
  color: var(--color-text);
  cursor: pointer;
}

.select-field__trigger:focus {
  outline: none;
}

.select-field__trigger:focus-visible {
  border-color: var(--color-orange);
  outline: var(--focus-ring-width) solid var(--color-orange);
  outline-offset: var(--focus-ring-offset);
}

.select-field--open .select-field__trigger {
  border-color: var(--color-orange);
}

.select-field__value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-field__value--placeholder {
  color: var(--color-muted);
}

.select-field__icon {
  flex-shrink: 0;
  width: var(--space-4);
  height: var(--space-4);
}

.select-field__chevron {
  color: var(--color-muted);
}

.select-field--open .select-field__chevron {
  transform: rotate(180deg);
}

/* Figma shows the menu in flow; it floats here so opening it doesn't push the form around */
.select-field__menu {
  position: absolute;
  top: 100%;
  right: 0;
  left: 0;
  z-index: var(--z-menu);
  max-height: var(--size-menu-max);
  margin-top: var(--space-2);
  padding: var(--space-2);
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.select-field__group {
  padding: var(--space-2) var(--space-3);
  color: var(--color-muted);
}

.select-field__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.select-field__option {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  cursor: pointer;
}

.select-field__option-label {
  flex: 1 1 auto;
  min-width: 0;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

.select-field__option-meta {
  flex-shrink: 0;
  color: var(--color-muted);
  text-align: right;
}

.select-field__option--active {
  outline: var(--focus-ring-width) solid var(--color-text);
  outline-offset: calc(-1 * var(--focus-ring-width));
}

.select-field__option[aria-selected='true'],
.select-field__option[aria-selected='true'] .select-field__option-meta {
  color: var(--color-orange);
}

.select-field__option[aria-selected='true'] {
  background: var(--color-orange-dim);
}

.select-field__option[aria-disabled='true'] {
  color: var(--color-muted);
  cursor: not-allowed;
  opacity: var(--opacity-disabled);
}

.select-field__message {
  color: var(--color-muted);
}

.select-field--error .select-field__trigger {
  border-color: var(--color-red);
}

.select-field--error .select-field__trigger:focus-visible {
  outline-color: var(--color-red);
}

.select-field__error {
  color: var(--color-red);
}

.select-field--disabled .select-field__trigger {
  background: var(--color-panel);
  color: var(--color-muted);
  cursor: not-allowed;
}
</style>
```

- [ ] **Step 7: Run the test**

Run: `cd apps/web && npx vitest run src/components/ui/__tests__/SelectField.spec.ts`
Expected: PASS.

- [ ] **Step 8: Add it to the preview page.** In `apps/web/src/views/dev/ComponentsPreviewView.vue`, import `SelectField` and `type SelectOption` (from `@/components/ui/select-field`), add to the script:

```ts
const robotOptions: SelectOption[] = [
  { value: 'tita', label: 'Titã', meta: 'Equipe Volt · Peso leve' },
  { value: 'nemesis', label: 'Nêmesis', meta: 'Equipe Impacto · Peso leve' },
  { value: 'cobalto', label: 'Cobalto', meta: 'Equipe Órbita · Peso leve' },
  {
    value: 'marte',
    label: 'Marte',
    meta: 'Equipe Órbita · Peso leve',
    disabled: true,
    disabledReason: 'Já escolhido como Robô 1',
  },
]
const pickedRobot = ref('cobalto')
const emptyRobot = ref('')
```

and add this section right after the `Input / Field` section:

```vue
    <section class="preview__section">
      <h2 class="text-heading-m">Select / Menu</h2>
      <div class="preview__fields">
        <SelectField
          v-model="pickedRobot"
          label="Robô 2 *"
          :options="robotOptions"
          group-label="Participantes · Peso leve"
          hint="Equipe Órbita · Peso leve"
        />
        <SelectField
          v-model="emptyRobot"
          label="Sem seleção, com erro"
          :options="robotOptions"
          placeholder="Escolha um robô"
          error="Escolha o robô 2."
        />
        <SelectField label="Desativado" :options="robotOptions" disabled />
      </div>
    </section>
```

- [ ] **Step 9: Document it.** In `apps/web/CLAUDE.md`, add this row to the "Figma component → Vue file" table, after `Input / Field`:

```
| `Select / Menu` · `Select / Option`                  | `SelectField.vue` (`v-model`, `options`, `error` prop)    |
```

- [ ] **Step 10: Check it by hand.** `npm run dev`, open `/dev/components`, and with the keyboard only: Tab to a select, open it with ArrowDown, move, pick with Enter, close with Escape. Click outside to close. Confirm there is no hover effect, and compare with the Figma screenshot.

- [ ] **Step 11: Type-check, lint, commit**

Run: `cd apps/web && npx vitest run && npm run type-check && npm run lint`
Expected: PASS.

```bash
git add apps/web/src/components/ui apps/web/src/styles/tokens.css apps/web/src/views/dev/ComponentsPreviewView.vue apps/web/CLAUDE.md
git commit -m "feat(web): add SelectField component

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Participant form logic

**Files:**
- Create: `apps/web/src/views/organizer/participant-form.ts`
- Create: `apps/web/src/views/organizer/__tests__/participant-form.spec.ts`

**Interfaces:**
- Consumes: `RobotInput` (Task 6); `normalizeText`, `WEIGHT_CLASSES`, `WEIGHT_CLASS_LABELS`, `isWeightClass` from `@/utils/robot` (Task 6); `SelectOption` (Task 10).
- Produces: `WEIGHT_CLASS_OPTIONS: SelectOption[]` (the two classes with their labels), `ParticipantFormValues = { name; team; weightClass }` (`weightClass` is `''` until picked), `ParticipantFormField`, `ParticipantFormErrors`, `PARTICIPANT_MESSAGES`, `emptyParticipantValues()`, `participantValuesFrom(robot: Robot)`, `validateParticipantForm(values)`, `toRobotInput(values): RobotInput`, `participantPreview(values): { team: string; robot: string; details?: string }`, `describeSaveError(error): { message: string; fields: ParticipantFormErrors }`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/views/organizer/__tests__/participant-form.spec.ts`

```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import type { Robot } from '@/types'
import {
  PARTICIPANT_MESSAGES,
  WEIGHT_CLASS_OPTIONS,
  describeSaveError,
  emptyParticipantValues,
  participantPreview,
  participantValuesFrom,
  toRobotInput,
  validateParticipantForm,
} from '../participant-form'

describe('validateParticipantForm', () => {
  it('requires every field, ignoring blank space', () => {
    expect(validateParticipantForm({ name: ' ', team: '', weightClass: '' })).toEqual({
      name: PARTICIPANT_MESSAGES.nameRequired,
      team: PARTICIPANT_MESSAGES.teamRequired,
      weightClass: PARTICIPANT_MESSAGES.weightClassRequired,
    })
  })

  it('accepts only the two weight classes', () => {
    expect(
      validateParticipantForm({ name: 'Titã', team: 'Equipe Volt', weightClass: '3 kg' }),
    ).toEqual({ weightClass: PARTICIPANT_MESSAGES.weightClassRequired })
  })

  it('accepts filled values', () => {
    expect(
      validateParticipantForm({ name: 'Titã', team: 'Equipe Volt', weightClass: 'heavyweight' }),
    ).toEqual({})
  })
})

describe('form values', () => {
  it('starts empty and copies only the editable fields of a robot', () => {
    const robot: Robot = {
      id: 'r1',
      championshipId: 'c1',
      name: 'Titã',
      team: 'Equipe Volt',
      weightClass: 'lightweight',
      owner: 'A. Moraes',
      createdAt: '',
      modifiedAt: '',
    }

    expect(emptyParticipantValues()).toEqual({ name: '', team: '', weightClass: '' })
    expect(participantValuesFrom(robot)).toEqual({
      name: 'Titã',
      team: 'Equipe Volt',
      weightClass: 'lightweight',
    })
  })

  it('leaves an older weight class blank so the organizer picks one', () => {
    const robot: Robot = {
      id: 'r1',
      championshipId: 'c1',
      name: 'Titã',
      team: 'Equipe Volt',
      weightClass: '3 kg',
      createdAt: '',
      modifiedAt: '',
    }

    expect(participantValuesFrom(robot).weightClass).toBe('')
  })

  it('offers the two weight classes with their labels', () => {
    expect(WEIGHT_CLASS_OPTIONS).toEqual([
      { value: 'lightweight', label: 'Peso leve' },
      { value: 'heavyweight', label: 'Peso pesado' },
    ])
  })

  it('normalizes the payload like the API', () => {
    expect(
      toRobotInput({ name: '  Titã ', team: 'Equipe   Volt', weightClass: 'lightweight' }),
    ).toEqual({
      name: 'Titã',
      team: 'Equipe Volt',
      weightClass: 'lightweight',
    })
  })
})

describe('participantPreview', () => {
  it('shows what will be saved', () => {
    expect(
      participantPreview({ name: ' Titã ', team: 'Equipe Volt', weightClass: 'heavyweight' }),
    ).toEqual({
      robot: 'Titã',
      team: 'Equipe Volt',
      details: 'Peso pesado',
    })
  })

  it('uses stand-ins while fields are empty', () => {
    expect(participantPreview(emptyParticipantValues())).toEqual({
      robot: 'Nome do robô',
      team: 'Equipe',
      details: undefined,
    })
  })
})

describe('describeSaveError', () => {
  const apiError = (status: number, ...details: string[]) =>
    new ApiError(status, details[0] ?? 'Error', details)

  it('maps a taken name to the name field', () => {
    expect(describeSaveError(apiError(409, 'robot_name_taken'))).toEqual({
      message: PARTICIPANT_MESSAGES.reviewFields,
      fields: { name: PARTICIPANT_MESSAGES.nameTaken },
    })
  })

  it('maps a locked weight class to its field', () => {
    expect(describeSaveError(apiError(409, 'robot_has_matches'))).toEqual({
      message: PARTICIPANT_MESSAGES.reviewFields,
      fields: { weightClass: PARTICIPANT_MESSAGES.weightClassLocked },
    })
  })

  it('maps class-validator messages by property', () => {
    expect(
      describeSaveError(
        apiError(
          400,
          'team should not be empty',
          'weightClass must be one of the following values: lightweight, heavyweight',
        ),
      ),
    ).toEqual({
      message: PARTICIPANT_MESSAGES.reviewFields,
      fields: {
        team: PARTICIPANT_MESSAGES.teamInvalid,
        weightClass: PARTICIPANT_MESSAGES.weightClassInvalid,
      },
    })
  })

  it('explains a championship or robot that no longer exists', () => {
    expect(describeSaveError(apiError(404, 'robot_not_found')).message).toBe(
      PARTICIPANT_MESSAGES.notFound,
    )
  })

  it('handles network and unknown failures', () => {
    expect(describeSaveError(new ApiError(0, 'Failed to fetch')).message).toBe(
      PARTICIPANT_MESSAGES.noConnection,
    )
    expect(describeSaveError(new Error('boom'))).toEqual({
      message: PARTICIPANT_MESSAGES.generic,
      fields: {},
    })
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd apps/web && npx vitest run src/views/organizer/__tests__/participant-form.spec.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `apps/web/src/views/organizer/participant-form.ts`

```ts
// Pure logic for ParticipantFormView (Figma 09b). Validation mirrors `CreateRobotDto` and the
// name and weight-class rules in `RobotsService` (apps/api), so the API never rejects what the
// form accepts except for conflicts it alone can see.
import { ApiError } from '@/api/client'
import type { SelectOption } from '@/components/ui/select-field'
import type { RobotInput } from '@/mocks'
import type { Robot, WeightClass } from '@/types'
import { WEIGHT_CLASSES, WEIGHT_CLASS_LABELS, isWeightClass, normalizeText } from '@/utils/robot'

export interface ParticipantFormValues {
  name: string
  team: string
  /** A `WeightClass`, or '' until one is picked */
  weightClass: string
}
export type ParticipantFormField = keyof ParticipantFormValues
export type ParticipantFormErrors = Partial<Record<ParticipantFormField, string>>

export const PARTICIPANT_MESSAGES = {
  nameRequired: 'Informe o nome do robô.',
  teamRequired: 'Informe a equipe.',
  weightClassRequired: 'Escolha a categoria de peso.',
  nameTaken: 'Já existe um robô com esse nome neste campeonato.',
  weightClassLocked: 'Este robô já está em lutas, então a categoria de peso não pode mudar.',
  nameInvalid: 'Nome inválido.',
  teamInvalid: 'Equipe inválida.',
  weightClassInvalid: 'Categoria de peso inválida.',
  notFound: 'O campeonato ou o participante não existe mais. Volte para a lista de participantes.',
  noConnection: 'Não foi possível conectar ao servidor. Tente novamente.',
  reviewFields: 'Revise os campos destacados.',
  generic: 'Não foi possível salvar o participante. Tente novamente.',
} as const

export const emptyParticipantValues = (): ParticipantFormValues => ({
  name: '',
  team: '',
  weightClass: '',
})

/** "Categoria de peso" picker options */
export const WEIGHT_CLASS_OPTIONS: SelectOption[] = WEIGHT_CLASSES.map((value) => ({
  value,
  label: WEIGHT_CLASS_LABELS[value],
}))

/** A weight class saved before the two classes existed is left blank, so the organizer picks one */
export function participantValuesFrom(robot: Robot): ParticipantFormValues {
  return {
    name: robot.name,
    team: robot.team,
    weightClass: isWeightClass(robot.weightClass) ? robot.weightClass : '',
  }
}

export function validateParticipantForm(values: ParticipantFormValues): ParticipantFormErrors {
  const errors: ParticipantFormErrors = {}
  if (!values.name.trim()) errors.name = PARTICIPANT_MESSAGES.nameRequired
  if (!values.team.trim()) errors.team = PARTICIPANT_MESSAGES.teamRequired
  if (!isWeightClass(values.weightClass)) {
    errors.weightClass = PARTICIPANT_MESSAGES.weightClassRequired
  }
  return errors
}

/** Same normalization as the API DTO. Call it only after validateParticipantForm passed. */
export function toRobotInput(values: ParticipantFormValues): RobotInput {
  return {
    name: normalizeText(values.name),
    team: normalizeText(values.team),
    // validateParticipantForm only lets one of the two classes through
    weightClass: values.weightClass as WeightClass,
  }
}

/** "Prévia na luta": CompetitorTile props, with stand-ins while fields are empty */
export function participantPreview(values: ParticipantFormValues): {
  team: string
  robot: string
  details?: string
} {
  const name = normalizeText(values.name)
  const team = normalizeText(values.team)
  return {
    robot: name || 'Nome do robô',
    team: team || 'Equipe',
    // "Peso leve" / "Peso pesado", in place of Figma's "Peso 3 kg"
    details: isWeightClass(values.weightClass)
      ? WEIGHT_CLASS_LABELS[values.weightClass]
      : undefined,
  }
}

// Service codes, then class-validator messages (they start with the property name)
const apiFieldMessages: [RegExp, ParticipantFormField, string][] = [
  [/^robot_name_taken$/, 'name', PARTICIPANT_MESSAGES.nameTaken],
  [/^robot_has_matches$/, 'weightClass', PARTICIPANT_MESSAGES.weightClassLocked],
  [/^name\b/, 'name', PARTICIPANT_MESSAGES.nameInvalid],
  [/^team\b/, 'team', PARTICIPANT_MESSAGES.teamInvalid],
  [/^weightClass\b/, 'weightClass', PARTICIPANT_MESSAGES.weightClassInvalid],
]

export function describeSaveError(error: unknown): {
  message: string
  fields: ParticipantFormErrors
} {
  if (error instanceof ApiError) {
    if (error.status === 0) return { message: PARTICIPANT_MESSAGES.noConnection, fields: {} }
    if (error.status === 404) return { message: PARTICIPANT_MESSAGES.notFound, fields: {} }
    if (error.status === 400 || error.status === 409) {
      const fields: ParticipantFormErrors = {}
      for (const detail of error.details) {
        const match = apiFieldMessages.find(([pattern]) => pattern.test(detail))
        if (match && !fields[match[1]]) fields[match[1]] = match[2]
      }
      if (Object.keys(fields).length > 0) {
        return { message: PARTICIPANT_MESSAGES.reviewFields, fields }
      }
    }
  }
  return { message: PARTICIPANT_MESSAGES.generic, fields: {} }
}
```

- [ ] **Step 4: Run, lint, commit**

Run: `cd apps/web && npx vitest run src/views/organizer/__tests__/participant-form.spec.ts && npm run type-check && npm run lint`
Expected: PASS.

```bash
git add apps/web/src/views/organizer/participant-form.ts apps/web/src/views/organizer/__tests__/participant-form.spec.ts
git commit -m "feat(web): add participant form validation and error mapping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Adicionar / editar participante (Figma 09b, node 120:493)

**Files:**
- Modify (replace placeholder): `apps/web/src/views/organizer/ParticipantFormView.vue`
- Create: `apps/web/src/views/organizer/__tests__/ParticipantFormView.spec.ts`

**Interfaces:**
- Consumes: Task 11's module; `SelectField` (Task 10); `getChampionship`, `getRobots`, `createRobot`, `updateRobot` from `@/mocks`; route props from Task 7 (`mode`, `championshipId`, `robotId?`); blocks from Task 8; `CompetitorTile`.
- Produces: the finished screen. After a save it goes to `championship-participants`, except "Salvar e adicionar outro", which stays on the form.

- [ ] **Step 1: Write the failing test** — `apps/web/src/views/organizer/__tests__/ParticipantFormView.spec.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import { TOKEN_STORAGE_KEY } from '@/stores/auth'
import { liveToken } from '@/stores/__tests__/token-helpers'
import type { RobotInput } from '@/mocks'
import type { Championship, Robot } from '@/types'
import ParticipantFormView from '../ParticipantFormView.vue'
import { PARTICIPANT_MESSAGES } from '../participant-form'

vi.mock('@/mocks', () => ({
  getChampionship: vi.fn<(id: string) => Promise<Championship | null>>(),
  getRobots: vi.fn<(championshipId: string) => Promise<Robot[]>>(),
  createRobot:
    vi.fn<(championshipId: string, input: RobotInput, token: string) => Promise<Robot>>(),
  updateRobot: vi.fn<(id: string, input: RobotInput, token: string) => Promise<Robot>>(),
}))
import { createRobot, getChampionship, getRobots, updateRobot } from '@/mocks'

const stub = { render: () => null }
const LEAVE_MESSAGE = 'Há alterações não salvas. Deseja sair mesmo assim?'
const base = { createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' }
const championship: Championship = { ...base, id: 'c1', name: 'Copa 2026', startDate: '2026-12-09' }
const tita: Robot = {
  ...base,
  id: 'r1',
  championshipId: 'c1',
  name: 'Titã',
  team: 'Equipe Volt',
  weightClass: 'lightweight',
}

let token = ''
let confirmSpy: ReturnType<typeof vi.spyOn>

async function mountView(path: string, attach = false) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/manage', name: 'my-championships', component: stub },
      {
        path: '/manage/:championshipId/participants',
        name: 'championship-participants',
        component: stub,
      },
      {
        path: '/manage/:championshipId/participants/new',
        name: 'participant-create',
        component: ParticipantFormView,
        props: (route) => ({ mode: 'create', championshipId: route.params.championshipId }),
      },
      {
        path: '/manage/:championshipId/participants/:robotId/edit',
        name: 'participant-edit',
        component: ParticipantFormView,
        props: (route) => ({
          mode: 'edit',
          championshipId: route.params.championshipId,
          robotId: route.params.robotId,
        }),
      },
    ],
  })
  await router.push(path)
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(
    { template: '<RouterView />' },
    { global: { plugins: [pinia, router] }, ...(attach && { attachTo: document.body }) },
  )
  await flushPromises()
  return { wrapper, router }
}

type Wrapper = Awaited<ReturnType<typeof mountView>>['wrapper']

const input = (wrapper: Wrapper, name: string) =>
  wrapper.get<HTMLInputElement>(`input[name="${name}"]`)
const buttonByText = (wrapper: Wrapper, text: string) =>
  wrapper.findAll('button').find((b) => b.text() === text)
const cancelLink = (wrapper: Wrapper) => wrapper.findAll('a').find((a) => a.text() === 'Cancelar')!
const crumbs = (wrapper: Wrapper) =>
  wrapper.findAll('nav li:not([aria-hidden])').map((li) => li.text())

type WeightClassLabel = 'Peso leve' | 'Peso pesado'

const weightClassPicker = (wrapper: Wrapper) => wrapper.get('[role="combobox"]')

async function pickWeightClass(wrapper: Wrapper, label: WeightClassLabel) {
  await weightClassPicker(wrapper).trigger('click')
  await wrapper
    .findAll('[role="option"]')
    .find((option) => option.text().includes(label))!
    .trigger('click')
}

async function fill(
  wrapper: Wrapper,
  values: { name: string; team: string; weightClass: WeightClassLabel },
) {
  await input(wrapper, 'name').setValue(values.name)
  await input(wrapper, 'team').setValue(values.team)
  await pickWeightClass(wrapper, values.weightClass)
}

async function submit(wrapper: Wrapper) {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('ParticipantFormView', () => {
  beforeEach(() => {
    localStorage.clear()
    token = liveToken()
    vi.mocked(getChampionship).mockReset().mockResolvedValue(championship)
    vi.mocked(getRobots).mockReset().mockResolvedValue([tita])
    vi.mocked(createRobot).mockReset()
    vi.mocked(updateRobot).mockReset()
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  })
  afterEach(() => {
    confirmSpy.mockRestore()
  })

  it('create: starts empty with the create breadcrumb, title and actions', async () => {
    const { wrapper } = await mountView('/manage/c1/participants/new')

    expect(input(wrapper, 'name').element.value).toBe('')
    expect(crumbs(wrapper)).toEqual([
      'Meus campeonatos',
      'Copa 2026',
      'Participantes',
      'Novo participante',
    ])
    expect(wrapper.get('h1').text()).toBe('Adicionar participante')
    expect(buttonByText(wrapper, 'Salvar e adicionar outro')).toBeDefined()
    expect(wrapper.get('button[type="submit"]').text()).toBe('Adicionar participante')
    expect(cancelLink(wrapper).attributes('href')).toBe('/manage/c1/participants')
    expect(getRobots).not.toHaveBeenCalled()
  })

  it('create: submitting empty shows the required messages and does not save', async () => {
    const { wrapper } = await mountView('/manage/c1/participants/new')

    await submit(wrapper)

    expect(wrapper.text()).toContain(PARTICIPANT_MESSAGES.nameRequired)
    expect(wrapper.text()).toContain(PARTICIPANT_MESSAGES.teamRequired)
    expect(wrapper.text()).toContain(PARTICIPANT_MESSAGES.weightClassRequired)
    expect(createRobot).not.toHaveBeenCalled()
  })

  it('create: saves the normalized input and returns to the list without confirming', async () => {
    vi.mocked(createRobot).mockResolvedValue(tita)
    const { wrapper, router } = await mountView('/manage/c1/participants/new')

    await fill(wrapper, { name: '  Titã ', team: 'Equipe   Volt', weightClass: 'Peso leve' })
    await submit(wrapper)

    expect(createRobot).toHaveBeenCalledWith(
      'c1',
      { name: 'Titã', team: 'Equipe Volt', weightClass: 'lightweight' },
      token,
    )
    expect(router.currentRoute.value.name).toBe('championship-participants')
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('create: "Salvar e adicionar outro" saves, clears the form and focuses the name', async () => {
    vi.mocked(createRobot).mockResolvedValue(tita)
    const { wrapper, router } = await mountView('/manage/c1/participants/new', true)

    await fill(wrapper, { name: 'Titã', team: 'Equipe Volt', weightClass: 'Peso leve' })
    await buttonByText(wrapper, 'Salvar e adicionar outro')!.trigger('click')
    await flushPromises()

    expect(createRobot).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.name).toBe('participant-create')
    expect(input(wrapper, 'name').element.value).toBe('')
    expect(input(wrapper, 'team').element.value).toBe('')
    expect(weightClassPicker(wrapper).text()).toBe('Escolha a categoria')
    expect(document.activeElement).toBe(input(wrapper, 'name').element)
    expect(wrapper.get('[role="status"]').text()).toBe('Titã foi adicionado.')
    expect(wrapper.text()).not.toContain(PARTICIPANT_MESSAGES.nameRequired)
    wrapper.unmount()
  })

  it('ignores a second submit while saving', async () => {
    let resolve: (value: Robot) => void = () => {}
    vi.mocked(createRobot).mockReturnValue(new Promise((r) => (resolve = r)))
    const { wrapper } = await mountView('/manage/c1/participants/new')
    await fill(wrapper, { name: 'Titã', team: 'Equipe Volt', weightClass: 'Peso leve' })

    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')

    expect(createRobot).toHaveBeenCalledTimes(1)
    expect(wrapper.get('button[type="submit"]').attributes('aria-busy')).toBe('true')
    resolve(tita)
    await flushPromises()
  })

  it('maps a taken name to the name field', async () => {
    vi.mocked(createRobot).mockRejectedValue(
      new ApiError(409, 'robot_name_taken', ['robot_name_taken']),
    )
    const { wrapper } = await mountView('/manage/c1/participants/new')
    await fill(wrapper, { name: 'Titã', team: 'Equipe Volt', weightClass: 'Peso leve' })

    await submit(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toBe(PARTICIPANT_MESSAGES.reviewFields)
    expect(wrapper.text()).toContain(PARTICIPANT_MESSAGES.nameTaken)
    expect(input(wrapper, 'name').attributes('aria-invalid')).toBe('true')
  })

  it('updates the preview as the user types', async () => {
    const { wrapper } = await mountView('/manage/c1/participants/new')
    const tile = () => wrapper.get('.competitor-tile')

    expect(tile().text()).toContain('Lado A · Equipe')
    expect(tile().text()).toContain('Nome do robô')

    await fill(wrapper, { name: 'Titã', team: 'Equipe Volt', weightClass: 'Peso pesado' })

    expect(tile().text()).toContain('Lado A · Equipe Volt')
    expect(tile().text()).toContain('Titã')
    expect(tile().text()).toContain('Peso pesado')
  })

  it('edit: pre-fills the robot and saves with a single button', async () => {
    vi.mocked(updateRobot).mockResolvedValue({ ...tita, team: 'Equipe Nova' })
    const { wrapper, router } = await mountView('/manage/c1/participants/r1/edit')

    expect(getRobots).toHaveBeenCalledWith('c1')
    expect(input(wrapper, 'name').element.value).toBe('Titã')
    expect(weightClassPicker(wrapper).text()).toBe('Peso leve')
    expect(wrapper.get('h1').text()).toBe('Editar participante')
    expect(crumbs(wrapper).at(-1)).toBe('Editar participante')
    expect(buttonByText(wrapper, 'Salvar e adicionar outro')).toBeUndefined()
    expect(wrapper.get('button[type="submit"]').text()).toBe('Salvar alterações')

    await input(wrapper, 'team').setValue('Equipe Nova')
    await submit(wrapper)

    expect(updateRobot).toHaveBeenCalledWith(
      'r1',
      { name: 'Titã', team: 'Equipe Nova', weightClass: 'lightweight' },
      token,
    )
    expect(router.currentRoute.value.name).toBe('championship-participants')
  })

  it('edit: explains why the weight class cannot change', async () => {
    vi.mocked(updateRobot).mockRejectedValue(
      new ApiError(409, 'robot_has_matches', ['robot_has_matches']),
    )
    const { wrapper } = await mountView('/manage/c1/participants/r1/edit')

    await pickWeightClass(wrapper, 'Peso pesado')
    await submit(wrapper)

    expect(wrapper.text()).toContain(PARTICIPANT_MESSAGES.weightClassLocked)
    expect(weightClassPicker(wrapper).attributes('aria-invalid')).toBe('true')
  })

  it('edit: asks for a weight class when the saved one is not one of the two', async () => {
    vi.mocked(getRobots).mockResolvedValue([{ ...tita, weightClass: '3 kg' }])
    const { wrapper } = await mountView('/manage/c1/participants/r1/edit')

    expect(weightClassPicker(wrapper).text()).toBe('Escolha a categoria')
    await submit(wrapper)

    expect(wrapper.text()).toContain(PARTICIPANT_MESSAGES.weightClassRequired)
    expect(updateRobot).not.toHaveBeenCalled()
  })

  it('edit: shows not found for an unknown robot, with a way back to the list', async () => {
    const { wrapper } = await mountView('/manage/c1/participants/nope/edit')

    expect(wrapper.text()).toContain('Participante não encontrado.')
    expect(wrapper.find('form').exists()).toBe(false)
    const back = wrapper.findAll('a').find((a) => a.text() === 'Voltar para participantes')!
    expect(back.attributes('href')).toBe('/manage/c1/participants')
  })

  it('shows not found for an unknown championship', async () => {
    vi.mocked(getChampionship).mockResolvedValue(null)
    const { wrapper } = await mountView('/manage/nope/participants/new')

    expect(wrapper.text()).toContain('Campeonato não encontrado.')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('shows a retry panel when loading fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getRobots).mockRejectedValueOnce(new Error('boom'))
    const { wrapper } = await mountView('/manage/c1/participants/r1/edit')

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Não foi possível carregar o participante.',
    )
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()

    expect(input(wrapper, 'name').element.value).toBe('Titã')
    error.mockRestore()
  })

  it('asks before leaving with unsaved changes', async () => {
    const { wrapper, router } = await mountView('/manage/c1/participants/new')
    await input(wrapper, 'name').setValue('Titã')

    confirmSpy.mockReturnValue(false)
    await cancelLink(wrapper).trigger('click')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledWith(LEAVE_MESSAGE)
    expect(router.currentRoute.value.name).toBe('participant-create')

    confirmSpy.mockReturnValue(true)
    await cancelLink(wrapper).trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('championship-participants')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd apps/web && npx vitest run src/views/organizer/__tests__/ParticipantFormView.spec.ts`
Expected: FAIL (placeholder has no form).

- [ ] **Step 3: Fetch the design once.** Invoke `figma:figma-design-to-code`, then `get_design_context` and `get_screenshot` for node `120:493`.

- [ ] **Step 4: Implement** — replace `apps/web/src/views/organizer/ParticipantFormView.vue` with:

```vue
<script setup lang="ts">
// Figma: `09b / Organizador · Adicionar / editar participante` (node 120:493). One form for both
// modes. Mirrors ChampionshipFormView: touched-field validation, API field errors, a leave
// confirmation while dirty, and no state writes after unmount. Figma draws the weight class as a
// text input; it's a SelectField here because only two classes exist.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import CompetitorTile from '@/components/ui/CompetitorTile.vue'
import InputField from '@/components/ui/InputField.vue'
import SelectField from '@/components/ui/SelectField.vue'
import { createRobot, getChampionship, getRobots, updateRobot } from '@/mocks'
import { useAuthStore } from '@/stores/auth'
import type { Robot } from '@/types'
import LoadStatePanel from './components/LoadStatePanel.vue'
import OrganizerBreadcrumb from './components/OrganizerBreadcrumb.vue'
import OrganizerFooter from './components/OrganizerFooter.vue'
import {
  WEIGHT_CLASS_OPTIONS,
  describeSaveError,
  emptyParticipantValues,
  participantPreview,
  participantValuesFrom,
  toRobotInput,
  validateParticipantForm,
  type ParticipantFormErrors,
  type ParticipantFormField,
  type ParticipantFormValues,
} from './participant-form'

const { mode, championshipId, robotId } = defineProps<{
  mode: 'create' | 'edit'
  championshipId: string
  /** Only set in edit mode */
  robotId?: string
}>()

const auth = useAuthStore()
const router = useRouter()

const values = reactive(emptyParticipantValues())
const baseline = ref<ParticipantFormValues>(emptyParticipantValues())
const touched = reactive(new Set<ParticipantFormField>())
const apiFieldErrors = ref<ParticipantFormErrors>({})
const loadState = ref<'loading' | 'ready' | 'not-found' | 'error'>('loading')
const missing = ref<'championship' | 'robot'>('championship')
const championshipName = ref('')
const saving = ref(false)
const bannerError = ref<string | null>(null)
/** Name of the robot just saved with "Salvar e adicionar outro" */
const addedName = ref<string | null>(null)
const formEl = ref<HTMLFormElement | null>(null)
let isUnmounted = false

const fields = Object.keys(values) as ParticipantFormField[]
const clientErrors = computed(() => validateParticipantForm(values))
const fieldError = (field: ParticipantFormField) =>
  (touched.has(field) ? clientErrors.value[field] : undefined) ?? apiFieldErrors.value[field]
const isDirty = computed(() => fields.some((field) => values[field] !== baseline.value[field]))
const preview = computed(() => participantPreview(values))
const listRoute = computed(() => ({ name: 'championship-participants', params: { championshipId } }))

const breadcrumb = computed(() => [
  { label: 'Meus campeonatos', to: { name: 'my-championships' } },
  ...(championshipName.value ? [{ label: championshipName.value }] : []),
  { label: 'Participantes', to: listRoute.value },
  { label: mode === 'create' ? 'Novo participante' : 'Editar participante' },
])

const notFound = computed(() =>
  missing.value === 'robot'
    ? {
        text: 'Participante não encontrado.',
        back: { label: 'Voltar para participantes', to: listRoute.value },
      }
    : {
        text: 'Campeonato não encontrado.',
        back: { label: 'Voltar para meus campeonatos', to: { name: 'my-championships' } },
      },
)

function reset(next: ParticipantFormValues) {
  Object.assign(values, next)
  baseline.value = { ...next }
  touched.clear()
}

// Single data entry point for this view
async function load() {
  // The component is reused across these routes: only the latest request may write state
  const requested = { mode, championshipId, robotId }
  const isStale = () =>
    requested.mode !== mode ||
    requested.championshipId !== championshipId ||
    requested.robotId !== robotId
  loadState.value = 'loading'
  championshipName.value = ''
  try {
    const championship = await getChampionship(requested.championshipId)
    if (isStale()) return
    if (!championship) {
      missing.value = 'championship'
      loadState.value = 'not-found'
      return
    }
    championshipName.value = championship.name
    let robot: Robot | undefined
    if (requested.mode === 'edit') {
      robot = (await getRobots(requested.championshipId)).find((r) => r.id === requested.robotId)
      if (isStale()) return
      if (!robot) {
        missing.value = 'robot'
        loadState.value = 'not-found'
        return
      }
    }
    reset(robot ? participantValuesFrom(robot) : emptyParticipantValues())
    loadState.value = 'ready'
  } catch (error) {
    if (isStale()) return
    console.error('Failed to load participant', error)
    loadState.value = 'error'
  }
}
watch(() => [mode, championshipId, robotId], load, { immediate: true })

// A new edit invalidates the last attempt's banner, API field errors and confirmation
watch(values, () => {
  bannerError.value = null
  apiFieldErrors.value = {}
  addedName.value = null
})

/** `list` returns to the participants; `another` keeps the form open for the next robot */
async function onSubmit(next: 'list' | 'another') {
  if (saving.value) return
  fields.forEach((field) => touched.add(field))
  if (Object.keys(clientErrors.value).length > 0) {
    // Announce the failure to keyboard and screen reader users
    await nextTick()
    formEl.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }
  saving.value = true
  bannerError.value = null
  addedName.value = null
  try {
    const input = toRobotInput(values)
    const token = auth.token ?? ''
    if (mode === 'edit') await updateRobot(robotId!, input, token)
    else await createRobot(championshipId, input, token)
    // The user left while the request was in flight: don't pull them back
    if (isUnmounted) return
    if (next === 'another') {
      reset(emptyParticipantValues())
      // Inputs are disabled while saving; enable them before moving focus
      saving.value = false
      // The `values` watcher runs on the next tick and would clear the confirmation
      await nextTick()
      addedName.value = input.name
      formEl.value?.querySelector<HTMLInputElement>('input[name="name"]')?.focus()
      return
    }
    // Not dirty any more: skip the leave confirmation
    baseline.value = { ...values }
    await router.push(listRoute.value)
  } catch (error) {
    if (isUnmounted) return
    const described = describeSaveError(error)
    bannerError.value = described.message
    apiFieldErrors.value = described.fields
  } finally {
    saving.value = false
  }
}

const LEAVE_MESSAGE = 'Há alterações não salvas. Deseja sair mesmo assim?'
onBeforeRouteLeave(() => (isDirty.value && !window.confirm(LEAVE_MESSAGE) ? false : undefined))
onBeforeRouteUpdate(() => (isDirty.value && !window.confirm(LEAVE_MESSAGE) ? false : undefined))
function onBeforeUnload(event: BeforeUnloadEvent) {
  if (isDirty.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => {
  isUnmounted = true
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <div class="participant-form">
    <OrganizerBreadcrumb :items="breadcrumb" />

    <h1 class="participant-form__title text-display-page">
      {{ mode === 'create' ? 'Adicionar participante' : 'Editar participante' }}
    </h1>
    <p class="participant-form__muted text-body-m">
      {{
        mode === 'create'
          ? 'Cadastre um robô e a equipe dele neste campeonato.'
          : 'Altere os dados do robô. As mudanças aparecem nas lutas e na página pública.'
      }}
    </p>

    <LoadStatePanel
      v-if="loadState !== 'ready'"
      :state="loadState"
      loading-text="Carregando participante…"
      error-text="Não foi possível carregar o participante."
      :not-found-text="notFound.text"
      :back="notFound.back"
      @retry="load"
    />

    <div v-else class="participant-form__columns">
      <form
        ref="formEl"
        class="participant-form__card"
        novalidate
        aria-labelledby="participant-form-heading"
        @submit.prevent="onSubmit('list')"
      >
        <h2 id="participant-form-heading" class="participant-form__heading text-heading-m">
          Robô e equipe
        </h2>

        <InputField
          v-model="values.name"
          label="Nome do robô *"
          name="name"
          hint="Aparece nas lutas, na tela dos árbitros e na página pública."
          required
          :disabled="saving"
          :error="fieldError('name')"
          @focusout="touched.add('name')"
        />

        <div class="participant-form__pair">
          <InputField
            v-model="values.team"
            label="Equipe *"
            name="team"
            required
            :disabled="saving"
            :error="fieldError('team')"
            @focusout="touched.add('team')"
          />
          <SelectField
            v-model="values.weightClass"
            label="Categoria de peso *"
            placeholder="Escolha a categoria"
            :options="WEIGHT_CLASS_OPTIONS"
            hint="Uma luta só reúne robôs da mesma categoria."
            required
            :disabled="saving"
            :error="fieldError('weightClass')"
            @focusout="touched.add('weightClass')"
          />
        </div>

        <div v-if="bannerError" class="participant-form__banner" role="alert">
          <span class="participant-form__banner-dot" aria-hidden="true" />
          <p class="participant-form__banner-text text-body-s">{{ bannerError }}</p>
        </div>

        <div class="participant-form__actions">
          <p class="participant-form__saved text-body-s" role="status">
            {{ addedName ? `${addedName} foi adicionado.` : '' }}
          </p>
          <AppButton class="participant-form__button" variant="secondary" :to="listRoute">
            Cancelar
          </AppButton>
          <AppButton
            v-if="mode === 'create'"
            class="participant-form__button"
            variant="ghost"
            :disabled="saving"
            @click="onSubmit('another')"
          >
            Salvar e adicionar outro
          </AppButton>
          <AppButton
            class="participant-form__button"
            type="submit"
            :disabled="saving"
            :aria-busy="saving"
          >
            {{ mode === 'create' ? 'Adicionar participante' : 'Salvar alterações' }}
          </AppButton>
        </div>
      </form>

      <aside class="participant-form__aside">
        <section class="participant-form__panel">
          <h2 class="participant-form__heading text-heading-s">Prévia na luta</h2>
          <CompetitorTile
            side="A"
            :team="preview.team"
            :robot="preview.robot"
            :details="preview.details"
          />
          <p class="participant-form__muted text-body-s">
            Assim o robô aparece para operador, árbitros e público. O lado A ou B é definido na
            preparação de cada luta.
          </p>
        </section>
        <section class="participant-form__panel">
          <h2 class="participant-form__heading text-heading-s">Campos obrigatórios</h2>
          <p class="participant-form__muted text-body-s">
            Nome do robô, equipe e categoria de peso. O nome do robô não pode se repetir dentro do
            mesmo campeonato.
          </p>
        </section>
      </aside>
    </div>

    <OrganizerFooter />
  </div>
</template>

<style scoped>
.participant-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-28px);
}

.participant-form__title,
.participant-form__heading {
  color: var(--color-text);
  text-transform: uppercase;
}

.participant-form__muted {
  color: var(--color-muted);
}

.participant-form__columns {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-6);
}

.participant-form__card {
  display: flex;
  flex: 999 1 0;
  flex-direction: column;
  gap: var(--space-5);
  min-width: 50%;
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.participant-form__pair {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}

.participant-form__pair > * {
  flex: 1 1 0;
  min-width: 0;
}

.participant-form__banner {
  display: flex;
  align-items: center;
  gap: var(--space-10px);
  padding: var(--space-3) var(--space-14px);
  border: 1px solid var(--color-red);
  border-radius: var(--radius-sm);
  background: var(--color-red-dim);
}

.participant-form__banner-dot {
  flex-shrink: 0;
  width: var(--size-dot);
  height: var(--size-dot);
  border-radius: var(--radius-pill);
  background: var(--color-red);
}

.participant-form__banner-text {
  min-width: 0;
  color: var(--color-red);
}

.participant-form__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  padding-top: var(--space-2);
}

.participant-form__saved {
  margin-right: auto;
  color: var(--color-green);
}

.participant-form__button {
  min-height: var(--size-control-lg);
}

.participant-form__aside {
  display: flex;
  flex: 1 1 var(--size-aside);
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.participant-form__panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}
</style>
```

- [ ] **Step 5: Run tests, type-check, lint**

Run: `cd apps/web && npx vitest run && npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 6: Compare with Figma** in the dev server (demo mode) at `/manage/6f1c2a40-0001-4000-8000-000000000001/participants/new` and at `/…/participants/6f1c2a40-0003-4000-8000-000000000001/edit`. Fix token-level differences and list the rest in your report. Check that "Salvar e adicionar outro" then "Cancelar" leaves without a confirmation.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/views/organizer/ParticipantFormView.vue apps/web/src/views/organizer/__tests__/ParticipantFormView.spec.ts
git commit -m "feat(web): build the add and edit participant form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase E — Match screens (Figma 10 and 10b)

### Task 13: Lutas list (Figma 10, node 22:496)

**Files:**
- Create: `apps/web/src/utils/match.ts`
- Create: `apps/web/src/utils/__tests__/match.spec.ts`
- Create: `apps/web/src/views/organizer/matches-list.ts`
- Create: `apps/web/src/views/organizer/__tests__/matches-list.spec.ts`
- Modify (rewrite): `apps/web/src/views/organizer/MatchesView.vue`
- Create: `apps/web/src/views/organizer/__tests__/MatchesView.spec.ts`

**Interfaces:**
- Consumes: `getChampionship`, `getMatchSummaries`, `getRobots` (Task 6); routes `match-create`/`match-edit` (Task 7); blocks (Task 8); `StatusPill`, `TabItem`.
- Produces: `matchStatePill: Record<MatchState, { label: string; tone: 'info' | 'accent' | 'success' }>` (Task 15 uses `matchStatePill.waiting`). `MatchFilter`, `MATCH_FILTERS`, `matchFilterFrom(value: unknown)`, `inMatchFilter(state, filter)`, `matchesSubtitle(count)`, `matchRows(matches, robots): { match; robotA: string; robotB: string }[]`.

- [ ] **Step 1: Write the failing logic tests**

`apps/web/src/utils/__tests__/match.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { matchStatePill } from '../match'

describe('matchStatePill', () => {
  it('maps each match state to the Figma 10 label and tone', () => {
    expect(matchStatePill.waiting).toEqual({ label: 'Programada', tone: 'info' })
    expect(matchStatePill.running).toEqual({ label: 'Em andamento', tone: 'accent' })
    expect(matchStatePill.paused).toEqual({ label: 'Em andamento', tone: 'accent' })
    expect(matchStatePill.finished).toEqual({ label: 'Encerrada', tone: 'success' })
  })
})
```

`apps/web/src/views/organizer/__tests__/matches-list.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { MatchSummary, Robot } from '@/types'
import { inMatchFilter, matchFilterFrom, matchRows, matchesSubtitle } from '../matches-list'

describe('matchFilterFrom', () => {
  it('reads known tabs and falls back to all', () => {
    expect(matchFilterFrom('waiting')).toBe('waiting')
    expect(matchFilterFrom('running')).toBe('running')
    expect(matchFilterFrom('finished')).toBe('finished')
    expect(matchFilterFrom('paused')).toBe('all')
    expect(matchFilterFrom(['waiting'])).toBe('all')
    expect(matchFilterFrom(undefined)).toBe('all')
  })
})

describe('inMatchFilter', () => {
  it('puts running and paused fights under "Em andamento"', () => {
    expect(inMatchFilter('running', 'running')).toBe(true)
    expect(inMatchFilter('paused', 'running')).toBe(true)
    expect(inMatchFilter('waiting', 'running')).toBe(false)
    expect(inMatchFilter('waiting', 'waiting')).toBe(true)
    expect(inMatchFilter('finished', 'finished')).toBe(true)
    expect(inMatchFilter('finished', 'all')).toBe(true)
  })
})

describe('matchesSubtitle', () => {
  it('counts matches with the Figma copy', () => {
    expect(matchesSubtitle(15)).toBe('15 lutas · montadas manualmente, sem chaveamento automático.')
    expect(matchesSubtitle(1)).toBe('1 luta · montadas manualmente, sem chaveamento automático.')
  })
})

describe('matchRows', () => {
  it('pairs each match with its robot names', () => {
    const robot = (id: string, name: string): Robot => ({
      id,
      championshipId: 'c1',
      name,
      team: 'Equipe',
      weightClass: 'lightweight',
      createdAt: '',
      modifiedAt: '',
    })
    const match: MatchSummary = {
      id: 'm1',
      championshipId: 'c1',
      weightClass: 'lightweight',
      robotAId: 'r1',
      robotBId: 'gone',
      state: 'waiting',
      createdAt: '',
      modifiedAt: '',
    }

    expect(matchRows([match], [robot('r1', 'Titã')])).toEqual([
      { match, robotA: 'Titã', robotB: 'Robô removido' },
    ])
  })
})
```

Run: `cd apps/web && npx vitest run src/utils/__tests__/match.spec.ts src/views/organizer/__tests__/matches-list.spec.ts`
Expected: FAIL (modules missing).

- [ ] **Step 2: Implement the logic**

`apps/web/src/utils/match.ts`:

```ts
// Match display helpers shared by the organizer match list and form
import type { MatchState } from '@/types'

/** Figma 10: PROGRAMADA blue, EM ANDAMENTO orange (running or paused), ENCERRADA green */
export const matchStatePill: Record<
  MatchState,
  { label: string; tone: 'info' | 'accent' | 'success' }
> = {
  waiting: { label: 'Programada', tone: 'info' },
  running: { label: 'Em andamento', tone: 'accent' },
  paused: { label: 'Em andamento', tone: 'accent' },
  finished: { label: 'Encerrada', tone: 'success' },
}
```

`apps/web/src/views/organizer/matches-list.ts`:

```ts
// Pure logic for MatchesView (Figma 10)
import type { MatchState, MatchSummary, Robot } from '@/types'

export type MatchFilter = 'all' | 'waiting' | 'running' | 'finished'

export const MATCH_FILTERS: { value: MatchFilter; label: string; empty: string }[] = [
  { value: 'all', label: 'Todas', empty: 'Nenhuma luta ainda.' },
  { value: 'waiting', label: 'Programadas', empty: 'Nenhuma luta programada.' },
  { value: 'running', label: 'Em andamento', empty: 'Nenhuma luta em andamento.' },
  { value: 'finished', label: 'Encerradas', empty: 'Nenhuma luta encerrada.' },
]

/** The `?state=` query value; anything unknown falls back to "Todas" */
export function matchFilterFrom(value: unknown): MatchFilter {
  return value === 'waiting' || value === 'running' || value === 'finished' ? value : 'all'
}

/** "Em andamento" covers running and paused fights */
export function inMatchFilter(state: MatchState, filter: MatchFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'running') return state === 'running' || state === 'paused'
  return state === filter
}

const numberFormat = new Intl.NumberFormat('pt-BR')

/** "15 lutas · montadas manualmente, sem chaveamento automático." */
export function matchesSubtitle(count: number): string {
  const lutas = `${numberFormat.format(count)} ${count === 1 ? 'luta' : 'lutas'}`
  return `${lutas} · montadas manualmente, sem chaveamento automático.`
}

export interface MatchRow {
  match: MatchSummary
  robotA: string
  robotB: string
}

/** Robot names for each match. A robot missing from the list shows as "Robô removido". */
export function matchRows(matches: MatchSummary[], robots: Robot[]): MatchRow[] {
  const names = new Map(robots.map((robot) => [robot.id, robot.name]))
  return matches.map((match) => ({
    match,
    robotA: names.get(match.robotAId) ?? 'Robô removido',
    robotB: names.get(match.robotBId) ?? 'Robô removido',
  }))
}
```

Run the two specs again. Expected: PASS.

- [ ] **Step 3: Write the failing view test** — `apps/web/src/views/organizer/__tests__/MatchesView.spec.ts`

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

import type { Championship, MatchState, MatchSummary, Robot } from '@/types'
import MatchesView from '../MatchesView.vue'

vi.mock('@/mocks', () => ({
  getChampionship: vi.fn<(id: string) => Promise<Championship | null>>(),
  getMatchSummaries: vi.fn<(championshipId: string) => Promise<MatchSummary[]>>(),
  getRobots: vi.fn<(championshipId: string) => Promise<Robot[]>>(),
}))
import { getChampionship, getMatchSummaries, getRobots } from '@/mocks'

const stub = { render: () => null }
const base = { createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' }
const championship: Championship = { ...base, id: 'c1', name: 'Copa 2026', startDate: '2026-12-09' }
const robot = (id: string, name: string): Robot => ({
  ...base,
  id,
  championshipId: 'c1',
  name,
  team: 'Equipe',
  weightClass: 'lightweight',
})
const match = (id: string, robotAId: string, robotBId: string, state: MatchState): MatchSummary => ({
  ...base,
  id,
  championshipId: 'c1',
  weightClass: 'lightweight',
  robotAId,
  robotBId,
  state,
})

const robots = [robot('r1', 'Titã'), robot('r2', 'Nêmesis'), robot('r3', 'Marte'), robot('r4', 'Cobalto')]
const matches = [
  match('m1', 'r1', 'r2', 'waiting'),
  match('m2', 'r3', 'r4', 'running'),
  match('m3', 'r1', 'r3', 'paused'),
  match('m4', 'r2', 'r4', 'finished'),
]

async function mountView(path = '/manage/c1/matches') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/manage', name: 'my-championships', component: stub },
      {
        path: '/manage/:championshipId/matches',
        name: 'championship-matches',
        component: MatchesView,
        props: true,
      },
      { path: '/manage/:championshipId/matches/new', name: 'match-create', component: stub },
      {
        path: '/manage/:championshipId/matches/:matchId/edit',
        name: 'match-edit',
        component: stub,
      },
    ],
  })
  await router.push(path)
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

type Wrapper = Awaited<ReturnType<typeof mountView>>['wrapper']

const pairs = (wrapper: Wrapper) =>
  wrapper
    .findAll('tbody th')
    .map((th) => th.findAll('.matches__name').map((name) => name.text()).join(' × '))
const tab = (wrapper: Wrapper, label: string) =>
  wrapper.findAll('[role="tab"]').find((t) => t.text() === label)!

describe('MatchesView', () => {
  beforeEach(() => {
    vi.mocked(getChampionship).mockReset().mockResolvedValue(championship)
    vi.mocked(getMatchSummaries).mockReset().mockResolvedValue(matches)
    vi.mocked(getRobots).mockReset().mockResolvedValue(robots)
  })

  it('lists every match with robot names, status and the count', async () => {
    const { wrapper } = await mountView()

    expect(pairs(wrapper)).toEqual([
      'Titã × Nêmesis',
      'Marte × Cobalto',
      'Titã × Marte',
      'Nêmesis × Cobalto',
    ])
    const statuses = wrapper.findAll('tbody tr').map((tr) => tr.findAll('td')[0]!.text())
    expect(statuses).toEqual(['Programada', 'Em andamento', 'Em andamento', 'Encerrada'])
    expect(wrapper.text()).toContain('4 lutas · montadas manualmente, sem chaveamento automático.')
    expect(wrapper.findAll('nav li:not([aria-hidden])').map((li) => li.text())).toEqual([
      'Meus campeonatos',
      'Copa 2026',
      'Lutas',
    ])
  })

  it('offers Editar only on scheduled matches, and Criar luta', async () => {
    const { wrapper } = await mountView()
    const edits = wrapper.findAll('a').filter((a) => a.text() === 'Editar')

    expect(edits).toHaveLength(1)
    expect(edits[0]!.attributes('href')).toBe('/manage/c1/matches/m1/edit')
    expect(edits[0]!.attributes('aria-label')).toBe('Editar luta Titã contra Nêmesis')
    expect(wrapper.findAll('a').find((a) => a.text() === 'Criar luta')!.attributes('href')).toBe(
      '/manage/c1/matches/new',
    )
    expect(wrapper.text()).not.toContain('Abrir operação')
    expect(wrapper.text()).not.toContain('Preparar')
  })

  it('filters by tab and keeps the tab in the query', async () => {
    const { wrapper, router } = await mountView()

    await tab(wrapper, 'Programadas').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.state).toBe('waiting')
    expect(pairs(wrapper)).toEqual(['Titã × Nêmesis'])

    await tab(wrapper, 'Em andamento').trigger('click')
    await flushPromises()
    expect(pairs(wrapper)).toEqual(['Marte × Cobalto', 'Titã × Marte'])

    await tab(wrapper, 'Encerradas').trigger('click')
    await flushPromises()
    expect(pairs(wrapper)).toEqual(['Nêmesis × Cobalto'])

    await tab(wrapper, 'Todas').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.state).toBeUndefined()
    expect(pairs(wrapper)).toHaveLength(4)
  })

  it('restores the tab from the query and ignores unknown values', async () => {
    const running = await mountView('/manage/c1/matches?state=running')
    expect(tab(running.wrapper, 'Em andamento').attributes('aria-selected')).toBe('true')

    const bogus = await mountView('/manage/c1/matches?state=bogus')
    expect(tab(bogus.wrapper, 'Todas').attributes('aria-selected')).toBe('true')
  })

  it('shows empty states', async () => {
    vi.mocked(getMatchSummaries).mockResolvedValue([matches[0]!])
    const { wrapper } = await mountView('/manage/c1/matches?state=finished')
    expect(wrapper.text()).toContain('Nenhuma luta encerrada.')

    vi.mocked(getMatchSummaries).mockResolvedValue([])
    const empty = await mountView()
    expect(empty.wrapper.text()).toContain('Nenhuma luta ainda.')
    expect(empty.wrapper.find('[role="tablist"]').exists()).toBe(false)
  })

  it('shows not found for an unknown championship', async () => {
    vi.mocked(getChampionship).mockResolvedValue(null)
    const { wrapper } = await mountView('/manage/nope/matches')

    expect(wrapper.text()).toContain('Campeonato não encontrado.')
    expect(getMatchSummaries).not.toHaveBeenCalled()
  })

  it('shows a retry panel when loading fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getMatchSummaries).mockRejectedValueOnce(new Error('boom'))
    const { wrapper } = await mountView()

    expect(wrapper.get('[role="alert"]').text()).toContain('Não foi possível carregar as lutas.')
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()

    expect(pairs(wrapper)).toHaveLength(4)
    error.mockRestore()
  })
})
```

Run: `cd apps/web && npx vitest run src/views/organizer/__tests__/MatchesView.spec.ts`
Expected: FAIL (placeholder).

- [ ] **Step 4: Fetch the design once.** Invoke `figma:figma-design-to-code`, then `get_design_context` and `get_screenshot` for `22:496`.

- [ ] **Step 5: Implement** — replace `apps/web/src/views/organizer/MatchesView.vue` with:

```vue
<script setup lang="ts">
// Figma: `10 / Organizador · Lutas` (node 22:496). Scheduling only: waiting matches can be
// edited, and the running flow ("Abrir operação", "Preparar", "Ver detalhes") is not built.
// Finished rows show "A × B": there is no result data for "A venceu B" yet.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import TabItem from '@/components/ui/TabItem.vue'
import { getChampionship, getMatchSummaries, getRobots } from '@/mocks'
import type { MatchSummary, Robot } from '@/types'
import { matchStatePill } from '@/utils/match'
import EmptyState from './components/EmptyState.vue'
import LoadStatePanel from './components/LoadStatePanel.vue'
import OrganizerBreadcrumb from './components/OrganizerBreadcrumb.vue'
import OrganizerFooter from './components/OrganizerFooter.vue'
import {
  MATCH_FILTERS,
  inMatchFilter,
  matchFilterFrom,
  matchRows,
  matchesSubtitle,
  type MatchFilter,
} from './matches-list'

const { championshipId } = defineProps<{ championshipId: string }>()

const route = useRoute()
const router = useRouter()

const activeFilter = computed(() => matchFilterFrom(route.query.state))

// Kept in the query string so reload and back restore the tab
function selectFilter(value: MatchFilter) {
  router.replace({ query: { ...route.query, state: value === 'all' ? undefined : value } })
}

const loadState = ref<'loading' | 'ready' | 'not-found' | 'error'>('loading')
const championshipName = ref('')
const matches = ref<MatchSummary[]>([])
const robots = ref<Robot[]>([])

// Single data entry point for this view
async function load() {
  // The component is reused when the id changes: only the latest request may write state
  const requestedId = championshipId
  loadState.value = 'loading'
  try {
    // Championship first: a malformed id is "not found" here, while the lists would reject it
    const championship = await getChampionship(requestedId)
    if (requestedId !== championshipId) return
    if (!championship) {
      loadState.value = 'not-found'
      return
    }
    const [loadedMatches, loadedRobots] = await Promise.all([
      getMatchSummaries(requestedId),
      getRobots(requestedId),
    ])
    if (requestedId !== championshipId) return
    championshipName.value = championship.name
    matches.value = loadedMatches
    robots.value = loadedRobots
    loadState.value = 'ready'
  } catch (error) {
    if (requestedId !== championshipId) return
    console.error('Failed to load matches', error)
    loadState.value = 'error'
  }
}
watch(() => championshipId, load, { immediate: true })

const rows = computed(() =>
  matchRows(
    matches.value.filter((m) => inMatchFilter(m.state, activeFilter.value)),
    robots.value,
  ),
)
const activeFilterEmpty = computed(
  () => MATCH_FILTERS.find((f) => f.value === activeFilter.value)?.empty ?? '',
)
const breadcrumb = computed(() => [
  { label: 'Meus campeonatos', to: { name: 'my-championships' } },
  ...(championshipName.value ? [{ label: championshipName.value }] : []),
  { label: 'Lutas' },
])
</script>

<template>
  <div class="matches">
    <OrganizerBreadcrumb :items="breadcrumb" />

    <header class="matches__header">
      <div class="matches__titles">
        <h1 class="matches__title text-display-page">Lutas</h1>
        <p v-if="loadState === 'ready'" class="matches__muted text-body-m">
          {{ matchesSubtitle(matches.length) }}
        </p>
      </div>
      <AppButton
        v-if="loadState === 'ready'"
        class="matches__create"
        :to="{ name: 'match-create', params: { championshipId } }"
      >
        Criar luta
      </AppButton>
    </header>

    <LoadStatePanel
      v-if="loadState !== 'ready'"
      :state="loadState"
      loading-text="Carregando lutas…"
      error-text="Não foi possível carregar as lutas."
      not-found-text="Campeonato não encontrado."
      :back="{ label: 'Voltar para meus campeonatos', to: { name: 'my-championships' } }"
      @retry="load"
    />

    <EmptyState
      v-else-if="matches.length === 0"
      title="Nenhuma luta ainda."
      text="Use “Criar luta” para montar o primeiro confronto."
    />

    <template v-else>
      <div class="matches__filters" role="tablist" aria-label="Filtrar lutas">
        <TabItem
          v-for="filter in MATCH_FILTERS"
          :key="filter.value"
          :label="filter.label"
          :active="activeFilter === filter.value"
          aria-controls="matches-list"
          @click="selectFilter(filter.value)"
        />
      </div>

      <div id="matches-list" role="tabpanel">
        <p v-if="rows.length === 0" class="matches__muted text-body-m">{{ activeFilterEmpty }}</p>
        <div v-else class="matches__card">
          <table class="matches__table">
            <thead class="text-overline">
              <tr>
                <th scope="col">Confronto</th>
                <th scope="col">Status</th>
                <th scope="col"><span class="visually-hidden">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="{ match, robotA, robotB } in rows"
                :key="match.id"
                :class="{ 'matches__row--finished': match.state === 'finished' }"
              >
                <th scope="row" class="matches__pair text-heading-s">
                  <span class="matches__name">{{ robotA }}</span>
                  <span class="matches__versus" aria-hidden="true">×</span>
                  <span class="visually-hidden">contra</span>
                  <span class="matches__name">{{ robotB }}</span>
                </th>
                <td><StatusPill v-bind="matchStatePill[match.state]" /></td>
                <td>
                  <div class="matches__actions">
                    <AppButton
                      v-if="match.state === 'waiting'"
                      variant="secondary"
                      :to="{ name: 'match-edit', params: { championshipId, matchId: match.id } }"
                      :aria-label="`Editar luta ${robotA} contra ${robotB}`"
                    >
                      Editar
                    </AppButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <OrganizerFooter />
  </div>
</template>

<style scoped>
.matches {
  display: flex;
  flex-direction: column;
  gap: var(--space-28px);
}

.matches__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.matches__titles {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.matches__title {
  color: var(--color-text);
  text-transform: uppercase;
}

.matches__muted {
  color: var(--color-muted);
}

.matches__create {
  min-height: var(--size-control-lg);
}

.matches__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

/* The card may scroll on very narrow screens; the page itself never scrolls sideways */
.matches__card {
  overflow-x: auto;
  padding: var(--space-2) var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.matches__table {
  width: 100%;
  border-collapse: collapse;
}

.matches__table th,
.matches__table td {
  padding: var(--space-4) var(--space-3) var(--space-4) 0;
  border-bottom: 1px solid var(--color-border-soft);
  text-align: left;
  vertical-align: middle;
  overflow-wrap: anywhere;
}

.matches__table tbody tr:last-child > * {
  border-bottom: none;
}

.matches__table thead th {
  color: var(--color-muted);
  font-weight: inherit;
}

.matches__pair {
  color: var(--color-text);
  text-transform: uppercase;
}

.matches__versus {
  margin: 0 var(--space-2);
  color: var(--color-muted);
}

.matches__row--finished .matches__pair {
  color: var(--color-muted);
}

.matches__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
```

- [ ] **Step 6: Run tests, type-check, lint**

Run: `cd apps/web && npx vitest run && npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 7: Compare with Figma** in the dev server at `/manage/6f1c2a40-0001-4000-8000-000000000001/matches` (demo data has finished, running and waiting fights). Fix token-level differences. In the report, list the deliberate gaps ("Em combate"/"Aguardando preparação" pills, the running-flow buttons, "A venceu B").

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/utils/match.ts apps/web/src/utils/__tests__/match.spec.ts apps/web/src/views/organizer/matches-list.ts apps/web/src/views/organizer/MatchesView.vue apps/web/src/views/organizer/__tests__/matches-list.spec.ts apps/web/src/views/organizer/__tests__/MatchesView.spec.ts
git commit -m "feat(web): build the matches list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: Match form logic

**Files:**
- Create: `apps/web/src/views/organizer/match-form.ts`
- Create: `apps/web/src/views/organizer/__tests__/match-form.spec.ts`

**Interfaces:**
- Consumes: `SelectOption` (Task 10), `MatchInput` (Task 6), `weightClassLabel` (Task 6), `Robot`, `MatchSummary`.
- Produces: `MatchFormValues = { robotAId; robotBId }`, `MatchFormField`, `MatchFormErrors`, `MATCH_MESSAGES`, `emptyMatchValues()`, `matchValuesFrom(match)`, `toMatchInput(values): MatchInput`, `robotSummary(robot)`, `robotHint(robots, robotId): string | undefined`, `robotOptions(robots, values, slot): { groupLabel: string; options: SelectOption[] }`, `pickRobot(robots, values, slot, robotId): MatchFormValues`, `validateMatchForm(robots, values)`, `matchPreview(robots, values): { robotA; robotB; teams }`, `describeSaveError(error, fallback?)`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/views/organizer/__tests__/match-form.spec.ts`

```ts
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import type { Robot } from '@/types'
import {
  MATCH_MESSAGES,
  describeSaveError,
  matchPreview,
  pickRobot,
  robotHint,
  robotOptions,
  validateMatchForm,
} from '../match-form'

const robot = (id: string, name: string, team: string, weightClass: string): Robot => ({
  id,
  championshipId: 'c1',
  name,
  team,
  weightClass,
  createdAt: '',
  modifiedAt: '',
})

const robots = [
  robot('tita', 'Titã', 'Equipe Volt', 'lightweight'),
  robot('marte', 'Marte', 'Equipe Órbita', 'lightweight'),
  robot('cobalto', 'Cobalto', 'Equipe Órbita', 'lightweight'),
  robot('bigorna', 'Bigorna', 'Equipe Bigorna', 'heavyweight'),
]

describe('robotOptions', () => {
  it('lists every robot for Robô 1 and disables the one picked as Robô 2', () => {
    const { groupLabel, options } = robotOptions(robots, { robotAId: '', robotBId: 'marte' }, 'robotAId')

    expect(groupLabel).toBe('Participantes')
    expect(options.map((o) => o.value)).toEqual(['tita', 'marte', 'cobalto', 'bigorna'])
    expect(options[0]).toMatchObject({ label: 'Titã', meta: 'Equipe Volt · Peso leve', disabled: false })
    expect(options[1]).toMatchObject({
      disabled: true,
      disabledReason: 'Já escolhido como Robô 2',
    })
  })

  it("lists only Robô 1's weight class for Robô 2 and disables Robô 1", () => {
    const { groupLabel, options } = robotOptions(robots, { robotAId: 'marte', robotBId: '' }, 'robotBId')

    expect(groupLabel).toBe('Participantes · Peso leve')
    expect(options.map((o) => o.value)).toEqual(['tita', 'marte', 'cobalto'])
    expect(options[1]).toMatchObject({
      disabled: true,
      disabledReason: 'Já escolhido como Robô 1',
    })
  })

  it('lists every robot for Robô 2 until Robô 1 is picked', () => {
    const { groupLabel, options } = robotOptions(robots, { robotAId: '', robotBId: '' }, 'robotBId')

    expect(groupLabel).toBe('Participantes')
    expect(options).toHaveLength(4)
  })
})

describe('pickRobot', () => {
  it('clears Robô 2 when Robô 1 changes to another weight class', () => {
    expect(pickRobot(robots, { robotAId: 'marte', robotBId: 'cobalto' }, 'robotAId', 'bigorna')).toEqual({
      robotAId: 'bigorna',
      robotBId: '',
    })
  })

  it('keeps Robô 2 within the same class', () => {
    expect(pickRobot(robots, { robotAId: 'marte', robotBId: 'cobalto' }, 'robotAId', 'tita')).toEqual({
      robotAId: 'tita',
      robotBId: 'cobalto',
    })
  })

  it('sets Robô 2 as picked', () => {
    expect(pickRobot(robots, { robotAId: 'marte', robotBId: '' }, 'robotBId', 'cobalto')).toEqual({
      robotAId: 'marte',
      robotBId: 'cobalto',
    })
  })
})

describe('robotHint', () => {
  it('shows the team and weight class of the picked robot', () => {
    expect(robotHint(robots, 'marte')).toBe('Equipe Órbita · Peso leve')
    expect(robotHint(robots, '')).toBeUndefined()
  })
})

describe('validateMatchForm', () => {
  it('requires both robots', () => {
    expect(validateMatchForm(robots, { robotAId: '', robotBId: '' })).toEqual({
      robotAId: MATCH_MESSAGES.robotARequired,
      robotBId: MATCH_MESSAGES.robotBRequired,
    })
  })

  it('rejects the same robot twice and mixed weight classes', () => {
    expect(validateMatchForm(robots, { robotAId: 'tita', robotBId: 'tita' })).toEqual({
      robotBId: MATCH_MESSAGES.mustDiffer,
    })
    expect(validateMatchForm(robots, { robotAId: 'tita', robotBId: 'bigorna' })).toEqual({
      robotBId: MATCH_MESSAGES.weightClassMismatch,
    })
  })

  it('accepts two robots of the same class', () => {
    expect(validateMatchForm(robots, { robotAId: 'marte', robotBId: 'cobalto' })).toEqual({})
  })
})

describe('matchPreview', () => {
  it('shows names, teams and the weight class', () => {
    expect(matchPreview(robots, { robotAId: 'marte', robotBId: 'cobalto' })).toEqual({
      robotA: 'Marte',
      robotB: 'Cobalto',
      teams: 'Equipe Órbita × Equipe Órbita · Peso leve',
    })
  })

  it('uses stand-ins before the robots are picked', () => {
    expect(matchPreview(robots, { robotAId: '', robotBId: '' })).toEqual({
      robotA: 'Robô 1',
      robotB: 'Robô 2',
      teams: 'Equipe × Equipe',
    })
  })
})

describe('describeSaveError', () => {
  const apiError = (status: number, code: string) => new ApiError(status, code, [code])

  it('maps pair errors to Robô 2', () => {
    expect(describeSaveError(apiError(400, 'match_weight_class_mismatch'))).toEqual({
      message: MATCH_MESSAGES.reviewFields,
      fields: { robotBId: MATCH_MESSAGES.weightClassMismatch },
    })
    expect(describeSaveError(apiError(400, 'match_robots_must_differ')).fields).toEqual({
      robotBId: MATCH_MESSAGES.mustDiffer,
    })
  })

  it('maps state and membership errors to the banner', () => {
    expect(describeSaveError(apiError(409, 'match_not_editable'))).toEqual({
      message: MATCH_MESSAGES.notEditable,
      fields: {},
    })
    expect(describeSaveError(apiError(400, 'robot_not_in_championship')).message).toBe(
      MATCH_MESSAGES.notInChampionship,
    )
    expect(describeSaveError(apiError(404, 'robot_not_found')).message).toBe(
      MATCH_MESSAGES.robotNotFound,
    )
    expect(describeSaveError(apiError(404, 'match_not_found')).message).toBe(
      MATCH_MESSAGES.matchNotFound,
    )
  })

  it('falls back per action', () => {
    expect(describeSaveError(new ApiError(0, 'offline')).message).toBe(MATCH_MESSAGES.noConnection)
    expect(describeSaveError(new Error('boom')).message).toBe(MATCH_MESSAGES.generic)
    expect(describeSaveError(new Error('boom'), MATCH_MESSAGES.deleteGeneric).message).toBe(
      MATCH_MESSAGES.deleteGeneric,
    )
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd apps/web && npx vitest run src/views/organizer/__tests__/match-form.spec.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `apps/web/src/views/organizer/match-form.ts`

```ts
// Pure logic for MatchFormView (Figma 10b): the two robot pickers, and validation mirroring
// `MatchesService.resolveRobots` in apps/api.
import { ApiError } from '@/api/client'
import type { SelectOption } from '@/components/ui/select-field'
import type { MatchInput } from '@/mocks'
import type { MatchSummary, Robot } from '@/types'
import { weightClassLabel } from '@/utils/robot'

export interface MatchFormValues {
  robotAId: string
  robotBId: string
}
export type MatchFormField = keyof MatchFormValues
export type MatchFormErrors = Partial<Record<MatchFormField, string>>

export const MATCH_MESSAGES = {
  robotARequired: 'Escolha o robô 1.',
  robotBRequired: 'Escolha o robô 2.',
  mustDiffer: 'Escolha dois robôs diferentes.',
  weightClassMismatch: 'Os dois robôs precisam ser da mesma categoria de peso.',
  notInChampionship: 'Um dos robôs não está inscrito neste campeonato. Recarregue a página.',
  robotNotFound: 'Um dos robôs foi removido. Recarregue a página.',
  notEditable: 'Esta luta não está mais programada e não pode ser alterada.',
  matchNotFound: 'Esta luta não existe mais.',
  noConnection: 'Não foi possível conectar ao servidor. Tente novamente.',
  reviewFields: 'Revise os campos destacados.',
  generic: 'Não foi possível salvar a luta. Tente novamente.',
  deleteGeneric: 'Não foi possível excluir a luta. Tente novamente.',
} as const

export const emptyMatchValues = (): MatchFormValues => ({ robotAId: '', robotBId: '' })

export const matchValuesFrom = (match: MatchSummary): MatchFormValues => ({
  robotAId: match.robotAId,
  robotBId: match.robotBId,
})

export const toMatchInput = (values: MatchFormValues): MatchInput => ({
  robotAId: values.robotAId,
  robotBId: values.robotBId,
})

const slotNumber: Record<MatchFormField, 1 | 2> = { robotAId: 1, robotBId: 2 }
const otherSlot = (slot: MatchFormField): MatchFormField =>
  slot === 'robotAId' ? 'robotBId' : 'robotAId'
const findRobot = (robots: Robot[], id: string) => robots.find((r) => r.id === id)

/** "Equipe Órbita · Peso leve" */
export const robotSummary = (robot: Robot) =>
  `${robot.team} · ${weightClassLabel(robot.weightClass)}`

/** Hint under a picker: the picked robot's team and weight class */
export function robotHint(robots: Robot[], robotId: string): string | undefined {
  const robot = findRobot(robots, robotId)
  return robot ? robotSummary(robot) : undefined
}

/**
 * Options for one picker. Robô 2 lists only Robô 1's weight class once Robô 1 is picked. Robô 1
 * always lists every robot so the organizer can switch class (`pickRobot` then clears Robô 2).
 * The robot picked on the other side stays in the list, disabled.
 */
export function robotOptions(
  robots: Robot[],
  values: MatchFormValues,
  slot: MatchFormField,
): { groupLabel: string; options: SelectOption[] } {
  const other = otherSlot(slot)
  const weightClass =
    slot === 'robotBId' ? findRobot(robots, values.robotAId)?.weightClass : undefined
  const listed = weightClass ? robots.filter((r) => r.weightClass === weightClass) : robots
  return {
    groupLabel: weightClass ? `Participantes · ${weightClassLabel(weightClass)}` : 'Participantes',
    options: listed.map((robot) => {
      const taken = robot.id === values[other]
      return {
        value: robot.id,
        label: robot.name,
        meta: robotSummary(robot),
        disabled: taken,
        disabledReason: taken ? `Já escolhido como Robô ${slotNumber[other]}` : undefined,
      }
    }),
  }
}

/** Sets one side. A Robô 1 of another weight class clears Robô 2. */
export function pickRobot(
  robots: Robot[],
  values: MatchFormValues,
  slot: MatchFormField,
  robotId: string,
): MatchFormValues {
  const next: MatchFormValues = { ...values, [slot]: robotId }
  if (slot === 'robotAId') {
    const robotA = findRobot(robots, robotId)
    const robotB = findRobot(robots, next.robotBId)
    if (robotA && robotB && robotA.weightClass !== robotB.weightClass) next.robotBId = ''
  }
  return next
}

export function validateMatchForm(robots: Robot[], values: MatchFormValues): MatchFormErrors {
  const errors: MatchFormErrors = {}
  if (!values.robotAId) errors.robotAId = MATCH_MESSAGES.robotARequired
  if (!values.robotBId) errors.robotBId = MATCH_MESSAGES.robotBRequired
  else if (values.robotBId === values.robotAId) errors.robotBId = MATCH_MESSAGES.mustDiffer
  else {
    const robotA = findRobot(robots, values.robotAId)
    const robotB = findRobot(robots, values.robotBId)
    if (robotA && robotB && robotA.weightClass !== robotB.weightClass) {
      errors.robotBId = MATCH_MESSAGES.weightClassMismatch
    }
  }
  return errors
}

/** "Prévia na lista": "Marte × Cobalto" and "Equipe Órbita × Equipe Órbita · Peso leve" */
export function matchPreview(
  robots: Robot[],
  values: MatchFormValues,
): { robotA: string; robotB: string; teams: string } {
  const robotA = findRobot(robots, values.robotAId)
  const robotB = findRobot(robots, values.robotBId)
  const weightClass = (robotA ?? robotB)?.weightClass
  const teams = `${robotA?.team ?? 'Equipe'} × ${robotB?.team ?? 'Equipe'}`
  return {
    robotA: robotA?.name ?? 'Robô 1',
    robotB: robotB?.name ?? 'Robô 2',
    teams: weightClass ? `${teams} · ${weightClassLabel(weightClass)}` : teams,
  }
}

const apiFieldMessages: [string, MatchFormField, string][] = [
  ['match_robots_must_differ', 'robotBId', MATCH_MESSAGES.mustDiffer],
  ['match_weight_class_mismatch', 'robotBId', MATCH_MESSAGES.weightClassMismatch],
]

// Changed elsewhere since the form loaded: nothing to fix in the fields
const apiBannerMessages: [string, string][] = [
  ['robot_not_in_championship', MATCH_MESSAGES.notInChampionship],
  ['match_not_editable', MATCH_MESSAGES.notEditable],
  ['robot_not_found', MATCH_MESSAGES.robotNotFound],
  ['match_not_found', MATCH_MESSAGES.matchNotFound],
]

/** Save and delete failures; `fallback` is the generic message for the action */
export function describeSaveError(
  error: unknown,
  fallback: string = MATCH_MESSAGES.generic,
): { message: string; fields: MatchFormErrors } {
  if (error instanceof ApiError) {
    if (error.status === 0) return { message: MATCH_MESSAGES.noConnection, fields: {} }
    const banner = apiBannerMessages.find(([code]) => error.details.includes(code))
    if (banner) return { message: banner[1], fields: {} }
    const fields: MatchFormErrors = {}
    for (const [code, field, message] of apiFieldMessages) {
      if (error.details.includes(code) && !fields[field]) fields[field] = message
    }
    if (Object.keys(fields).length > 0) return { message: MATCH_MESSAGES.reviewFields, fields }
  }
  return { message: fallback, fields: {} }
}
```

- [ ] **Step 4: Run, type-check, lint, commit**

Run: `cd apps/web && npx vitest run src/views/organizer/__tests__/match-form.spec.ts && npm run type-check && npm run lint`
Expected: PASS.

```bash
git add apps/web/src/views/organizer/match-form.ts apps/web/src/views/organizer/__tests__/match-form.spec.ts
git commit -m "feat(web): add match form picker rules and error mapping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 15: Nova / editar luta (Figma 10b, node 126:530)

**Files:**
- Modify (replace placeholder): `apps/web/src/views/organizer/MatchFormView.vue`
- Create: `apps/web/src/views/organizer/__tests__/MatchFormView.spec.ts`

**Interfaces:**
- Consumes: Task 14's module; `SelectField` (Task 10); `matchStatePill` (Task 13); `getChampionship`, `getRobots`, `getMatchSummaries`, `createMatch`, `updateMatch`, `deleteMatch` (Task 6); route props (Task 7); blocks (Task 8).
- Produces: the finished screen. Every successful save or delete goes to `championship-matches`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/views/organizer/__tests__/MatchFormView.spec.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import { TOKEN_STORAGE_KEY } from '@/stores/auth'
import { liveToken } from '@/stores/__tests__/token-helpers'
import type { MatchInput } from '@/mocks'
import type { Championship, MatchState, MatchSummary, Robot } from '@/types'
import MatchFormView from '../MatchFormView.vue'
import { MATCH_MESSAGES } from '../match-form'

vi.mock('@/mocks', () => ({
  getChampionship: vi.fn<(id: string) => Promise<Championship | null>>(),
  getRobots: vi.fn<(championshipId: string) => Promise<Robot[]>>(),
  getMatchSummaries: vi.fn<(championshipId: string) => Promise<MatchSummary[]>>(),
  createMatch:
    vi.fn<(championshipId: string, input: MatchInput, token: string) => Promise<MatchSummary>>(),
  updateMatch: vi.fn<(id: string, input: MatchInput, token: string) => Promise<MatchSummary>>(),
  deleteMatch: vi.fn<(id: string, token: string) => Promise<void>>(),
}))
import {
  createMatch,
  deleteMatch,
  getChampionship,
  getMatchSummaries,
  getRobots,
  updateMatch,
} from '@/mocks'

const stub = { render: () => null }
const LEAVE_MESSAGE = 'Há alterações não salvas. Deseja sair mesmo assim?'
const base = { createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' }
const championship: Championship = { ...base, id: 'c1', name: 'Copa 2026', startDate: '2026-12-09' }
const robot = (id: string, name: string, team: string, weightClass: string): Robot => ({
  ...base,
  id,
  championshipId: 'c1',
  name,
  team,
  weightClass,
})
const robots = [
  robot('tita', 'Titã', 'Equipe Volt', 'lightweight'),
  robot('marte', 'Marte', 'Equipe Órbita', 'lightweight'),
  robot('cobalto', 'Cobalto', 'Equipe Órbita', 'lightweight'),
  robot('bigorna', 'Bigorna', 'Equipe Bigorna', 'heavyweight'),
]
const summary = (state: MatchState = 'waiting'): MatchSummary => ({
  ...base,
  id: 'm1',
  championshipId: 'c1',
  weightClass: 'lightweight',
  robotAId: 'tita',
  robotBId: 'marte',
  state,
})

let token = ''
let confirmSpy: ReturnType<typeof vi.spyOn>

async function mountView(path: string) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/manage', name: 'my-championships', component: stub },
      { path: '/manage/:championshipId/matches', name: 'championship-matches', component: stub },
      {
        path: '/manage/:championshipId/participants/new',
        name: 'participant-create',
        component: stub,
      },
      {
        path: '/manage/:championshipId/matches/new',
        name: 'match-create',
        component: MatchFormView,
        props: (route) => ({ mode: 'create', championshipId: route.params.championshipId }),
      },
      {
        path: '/manage/:championshipId/matches/:matchId/edit',
        name: 'match-edit',
        component: MatchFormView,
        props: (route) => ({
          mode: 'edit',
          championshipId: route.params.championshipId,
          matchId: route.params.matchId,
        }),
      },
    ],
  })
  await router.push(path)
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

type Wrapper = Awaited<ReturnType<typeof mountView>>['wrapper']

const comboboxes = (wrapper: Wrapper) => wrapper.findAll('[role="combobox"]')
const options = (wrapper: Wrapper, picker: number) =>
  wrapper.findAll('[role="listbox"]')[picker]!.findAll('[role="option"]')
const optionName = (option: ReturnType<typeof options>[number]) =>
  option.get('.select-field__option-label').text()
const buttonByText = (wrapper: Wrapper, text: string) =>
  wrapper.findAll('button').find((b) => b.text() === text)
const cancelLink = (wrapper: Wrapper) => wrapper.findAll('a').find((a) => a.text() === 'Cancelar')!

async function pick(wrapper: Wrapper, picker: number, name: string) {
  await comboboxes(wrapper)[picker]!.trigger('click')
  await options(wrapper, picker)
    .find((option) => optionName(option) === name)!
    .trigger('click')
}

async function submit(wrapper: Wrapper) {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('MatchFormView', () => {
  beforeEach(() => {
    localStorage.clear()
    token = liveToken()
    vi.mocked(getChampionship).mockReset().mockResolvedValue(championship)
    vi.mocked(getRobots).mockReset().mockResolvedValue(robots)
    vi.mocked(getMatchSummaries).mockReset().mockResolvedValue([summary()])
    vi.mocked(createMatch).mockReset().mockResolvedValue(summary())
    vi.mocked(updateMatch).mockReset().mockResolvedValue(summary())
    vi.mocked(deleteMatch).mockReset().mockResolvedValue(undefined)
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  })
  afterEach(() => {
    confirmSpy.mockRestore()
  })

  it('create: shows two empty pickers, the breadcrumb and Criar luta', async () => {
    const { wrapper } = await mountView('/manage/c1/matches/new')

    expect(wrapper.get('h1').text()).toBe('Nova luta')
    expect(wrapper.findAll('nav li:not([aria-hidden])').map((li) => li.text())).toEqual([
      'Meus campeonatos',
      'Copa 2026',
      'Lutas',
      'Nova luta',
    ])
    expect(comboboxes(wrapper).map((c) => c.text())).toEqual(['Escolha um robô', 'Escolha um robô'])
    expect(wrapper.get('button[type="submit"]').text()).toBe('Criar luta')
    expect(buttonByText(wrapper, 'Excluir luta')).toBeUndefined()
    expect(getMatchSummaries).not.toHaveBeenCalled()
  })

  it("lists only Robô 1's weight class for Robô 2 and disables Robô 1 there", async () => {
    const { wrapper } = await mountView('/manage/c1/matches/new')

    await pick(wrapper, 0, 'Marte')
    await comboboxes(wrapper)[1]!.trigger('click')

    expect(options(wrapper, 1).map(optionName)).toEqual(['Titã', 'Marte', 'Cobalto'])
    const marte = options(wrapper, 1)[1]!
    expect(marte.attributes('aria-disabled')).toBe('true')
    expect(marte.text()).toContain('Já escolhido como Robô 1')
    expect(wrapper.text()).toContain('Participantes · Peso leve')
    expect(wrapper.text()).toContain('Equipe Órbita · Peso leve')
  })

  it('clears Robô 2 when Robô 1 switches to another weight class', async () => {
    const { wrapper } = await mountView('/manage/c1/matches/new')

    await pick(wrapper, 0, 'Marte')
    await pick(wrapper, 1, 'Cobalto')
    await pick(wrapper, 0, 'Bigorna')

    expect(comboboxes(wrapper)[0]!.text()).toBe('Bigorna')
    expect(comboboxes(wrapper)[1]!.text()).toBe('Escolha um robô')
  })

  it('submitting empty shows both required messages and does not save', async () => {
    const { wrapper } = await mountView('/manage/c1/matches/new')

    await submit(wrapper)

    expect(wrapper.text()).toContain(MATCH_MESSAGES.robotARequired)
    expect(wrapper.text()).toContain(MATCH_MESSAGES.robotBRequired)
    expect(createMatch).not.toHaveBeenCalled()
  })

  it('creates the match and returns to the list without confirming', async () => {
    const { wrapper, router } = await mountView('/manage/c1/matches/new')

    await pick(wrapper, 0, 'Marte')
    await pick(wrapper, 1, 'Cobalto')
    await submit(wrapper)

    expect(createMatch).toHaveBeenCalledWith(
      'c1',
      { robotAId: 'marte', robotBId: 'cobalto' },
      token,
    )
    expect(router.currentRoute.value.name).toBe('championship-matches')
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('maps a weight-class mismatch from the API to Robô 2', async () => {
    vi.mocked(createMatch).mockRejectedValue(
      new ApiError(400, 'match_weight_class_mismatch', ['match_weight_class_mismatch']),
    )
    const { wrapper } = await mountView('/manage/c1/matches/new')

    await pick(wrapper, 0, 'Marte')
    await pick(wrapper, 1, 'Cobalto')
    await submit(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toBe(MATCH_MESSAGES.reviewFields)
    expect(comboboxes(wrapper)[1]!.attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain(MATCH_MESSAGES.weightClassMismatch)
  })

  it('updates the preview as robots are picked', async () => {
    const { wrapper } = await mountView('/manage/c1/matches/new')
    const aside = () => wrapper.get('aside').text()

    expect(aside()).toContain('Robô 1')
    expect(aside()).toContain('Programada')

    await pick(wrapper, 0, 'Marte')
    await pick(wrapper, 1, 'Cobalto')

    expect(aside()).toContain('Marte')
    expect(aside()).toContain('Cobalto')
    expect(aside()).toContain('Equipe Órbita × Equipe Órbita · Peso leve')
  })

  it('asks for participants when fewer than two robots exist', async () => {
    vi.mocked(getRobots).mockResolvedValue([robots[0]!])
    const { wrapper } = await mountView('/manage/c1/matches/new')

    expect(wrapper.find('form').exists()).toBe(false)
    const add = wrapper.findAll('a').find((a) => a.text() === 'Adicionar participante')!
    expect(add.attributes('href')).toBe('/manage/c1/participants/new')
  })

  it('edit: pre-fills the robots and saves', async () => {
    const { wrapper, router } = await mountView('/manage/c1/matches/m1/edit')

    expect(wrapper.get('h1').text()).toBe('Editar luta')
    expect(comboboxes(wrapper).map((c) => c.text())).toEqual(['Titã', 'Marte'])
    expect(wrapper.get('button[type="submit"]').text()).toBe('Salvar luta')

    await pick(wrapper, 1, 'Cobalto')
    await submit(wrapper)

    expect(updateMatch).toHaveBeenCalledWith('m1', { robotAId: 'tita', robotBId: 'cobalto' }, token)
    expect(router.currentRoute.value.name).toBe('championship-matches')
  })

  it('edit: explains a match that started since the form loaded', async () => {
    vi.mocked(updateMatch).mockRejectedValue(
      new ApiError(409, 'match_not_editable', ['match_not_editable']),
    )
    const { wrapper } = await mountView('/manage/c1/matches/m1/edit')

    await pick(wrapper, 1, 'Cobalto')
    await submit(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toBe(MATCH_MESSAGES.notEditable)
  })

  it('edit: refuses a match that is no longer scheduled', async () => {
    vi.mocked(getMatchSummaries).mockResolvedValue([summary('running')])
    const { wrapper } = await mountView('/manage/c1/matches/m1/edit')

    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain(MATCH_MESSAGES.notEditable)
    const back = wrapper.findAll('a').find((a) => a.text() === 'Voltar para lutas')!
    expect(back.attributes('href')).toBe('/manage/c1/matches')
  })

  it('edit: shows not found for an unknown match', async () => {
    const { wrapper } = await mountView('/manage/c1/matches/nope/edit')

    expect(wrapper.text()).toContain('Luta não encontrada.')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('shows not found for an unknown championship', async () => {
    vi.mocked(getChampionship).mockResolvedValue(null)
    const { wrapper } = await mountView('/manage/nope/matches/new')

    expect(wrapper.text()).toContain('Campeonato não encontrado.')
    expect(getRobots).not.toHaveBeenCalled()
  })

  it('edit: deletes after confirming, once, and returns to the list', async () => {
    let resolve: () => void = () => {}
    vi.mocked(deleteMatch).mockReturnValue(new Promise<void>((r) => (resolve = r)))
    const { wrapper, router } = await mountView('/manage/c1/matches/m1/edit')

    confirmSpy.mockReturnValueOnce(false)
    await buttonByText(wrapper, 'Excluir luta')!.trigger('click')
    expect(deleteMatch).not.toHaveBeenCalled()

    await buttonByText(wrapper, 'Excluir luta')!.trigger('click')
    await buttonByText(wrapper, 'Excluir luta')!.trigger('click')
    expect(confirmSpy).toHaveBeenCalledWith('Excluir esta luta? Essa ação não pode ser desfeita.')
    expect(deleteMatch).toHaveBeenCalledTimes(1)
    expect(deleteMatch).toHaveBeenCalledWith('m1', token)

    resolve()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('championship-matches')
  })

  it('edit: shows why a delete failed', async () => {
    vi.mocked(deleteMatch).mockRejectedValue(
      new ApiError(409, 'match_not_editable', ['match_not_editable']),
    )
    const { wrapper } = await mountView('/manage/c1/matches/m1/edit')

    await buttonByText(wrapper, 'Excluir luta')!.trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe(MATCH_MESSAGES.notEditable)
  })

  it('asks before leaving with unsaved changes', async () => {
    const { wrapper, router } = await mountView('/manage/c1/matches/new')
    await pick(wrapper, 0, 'Marte')

    confirmSpy.mockReturnValue(false)
    await cancelLink(wrapper).trigger('click')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledWith(LEAVE_MESSAGE)
    expect(router.currentRoute.value.name).toBe('match-create')

    confirmSpy.mockReturnValue(true)
    await cancelLink(wrapper).trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('championship-matches')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd apps/web && npx vitest run src/views/organizer/__tests__/MatchFormView.spec.ts`
Expected: FAIL (placeholder).

- [ ] **Step 3: Fetch the design once.** Invoke `figma:figma-design-to-code`, then `get_design_context` and `get_screenshot` for `126:530`.

- [ ] **Step 4: Implement** — replace `apps/web/src/views/organizer/MatchFormView.vue` with:

```vue
<script setup lang="ts">
// Figma: `10b / Organizador · Nova / editar luta` (node 126:530). One form for both modes. Only
// waiting matches can be edited or deleted. Figma 10 has no delete action, so "Excluir luta"
// lives here in edit mode.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import SelectField from '@/components/ui/SelectField.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import {
  createMatch,
  deleteMatch,
  getChampionship,
  getMatchSummaries,
  getRobots,
  updateMatch,
} from '@/mocks'
import { useAuthStore } from '@/stores/auth'
import type { MatchSummary, Robot } from '@/types'
import { matchStatePill } from '@/utils/match'
import LoadStatePanel from './components/LoadStatePanel.vue'
import OrganizerBreadcrumb from './components/OrganizerBreadcrumb.vue'
import OrganizerFooter from './components/OrganizerFooter.vue'
import {
  MATCH_MESSAGES,
  describeSaveError,
  emptyMatchValues,
  matchPreview,
  matchValuesFrom,
  pickRobot,
  robotHint,
  robotOptions,
  toMatchInput,
  validateMatchForm,
  type MatchFormErrors,
  type MatchFormField,
  type MatchFormValues,
} from './match-form'

const { mode, championshipId, matchId } = defineProps<{
  mode: 'create' | 'edit'
  championshipId: string
  /** Only set in edit mode */
  matchId?: string
}>()

const auth = useAuthStore()
const router = useRouter()

const values = reactive(emptyMatchValues())
const baseline = ref<MatchFormValues>(emptyMatchValues())
const touched = reactive(new Set<MatchFormField>())
const apiFieldErrors = ref<MatchFormErrors>({})
const loadState = ref<'loading' | 'ready' | 'not-found' | 'not-editable' | 'error'>('loading')
const missing = ref<'championship' | 'match'>('championship')
const championshipName = ref('')
const robots = ref<Robot[]>([])
const saving = ref(false)
const deleting = ref(false)
const bannerError = ref<string | null>(null)
const formEl = ref<HTMLFormElement | null>(null)
let isUnmounted = false

const busy = computed(() => saving.value || deleting.value)
const fields = Object.keys(values) as MatchFormField[]
const clientErrors = computed(() => validateMatchForm(robots.value, values))
const fieldError = (field: MatchFormField) =>
  (touched.has(field) ? clientErrors.value[field] : undefined) ?? apiFieldErrors.value[field]
const isDirty = computed(() => fields.some((field) => values[field] !== baseline.value[field]))
const optionsA = computed(() => robotOptions(robots.value, values, 'robotAId'))
const optionsB = computed(() => robotOptions(robots.value, values, 'robotBId'))
const preview = computed(() => matchPreview(robots.value, values))
const listRoute = computed(() => ({ name: 'championship-matches', params: { championshipId } }))

const breadcrumb = computed(() => [
  { label: 'Meus campeonatos', to: { name: 'my-championships' } },
  ...(championshipName.value ? [{ label: championshipName.value }] : []),
  { label: 'Lutas', to: listRoute.value },
  { label: mode === 'create' ? 'Nova luta' : 'Editar luta' },
])

const notFound = computed(() =>
  missing.value === 'match'
    ? { text: 'Luta não encontrada.', back: { label: 'Voltar para lutas', to: listRoute.value } }
    : {
        text: 'Campeonato não encontrado.',
        back: { label: 'Voltar para meus campeonatos', to: { name: 'my-championships' } },
      },
)

function reset(next: MatchFormValues) {
  Object.assign(values, next)
  baseline.value = { ...next }
  touched.clear()
}

function pick(slot: MatchFormField, robotId: string) {
  Object.assign(values, pickRobot(robots.value, values, slot, robotId))
}

// Single data entry point for this view
async function load() {
  // The component is reused across these routes: only the latest request may write state
  const requested = { mode, championshipId, matchId }
  const isStale = () =>
    requested.mode !== mode ||
    requested.championshipId !== championshipId ||
    requested.matchId !== matchId
  loadState.value = 'loading'
  championshipName.value = ''
  try {
    const championship = await getChampionship(requested.championshipId)
    if (isStale()) return
    if (!championship) {
      missing.value = 'championship'
      loadState.value = 'not-found'
      return
    }
    championshipName.value = championship.name
    const [loadedRobots, summaries] = await Promise.all([
      getRobots(requested.championshipId),
      requested.mode === 'edit'
        ? getMatchSummaries(requested.championshipId)
        : Promise.resolve<MatchSummary[]>([]),
    ])
    if (isStale()) return
    const match = summaries.find((m) => m.id === requested.matchId)
    if (requested.mode === 'edit' && !match) {
      missing.value = 'match'
      loadState.value = 'not-found'
      return
    }
    robots.value = loadedRobots
    if (match && match.state !== 'waiting') {
      loadState.value = 'not-editable'
      return
    }
    reset(match ? matchValuesFrom(match) : emptyMatchValues())
    loadState.value = 'ready'
  } catch (error) {
    if (isStale()) return
    console.error('Failed to load match', error)
    loadState.value = 'error'
  }
}
watch(() => [mode, championshipId, matchId], load, { immediate: true })

// A new pick invalidates the last attempt's banner and API field errors
watch(values, () => {
  bannerError.value = null
  apiFieldErrors.value = {}
})

async function onSubmit() {
  if (busy.value) return
  fields.forEach((field) => touched.add(field))
  if (Object.keys(clientErrors.value).length > 0) {
    // Announce the failure to keyboard and screen reader users
    await nextTick()
    formEl.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }
  saving.value = true
  bannerError.value = null
  try {
    const input = toMatchInput(values)
    const token = auth.token ?? ''
    if (mode === 'edit') await updateMatch(matchId!, input, token)
    else await createMatch(championshipId, input, token)
    // The user left while the request was in flight: don't pull them back
    if (isUnmounted) return
    // Not dirty any more: skip the leave confirmation
    baseline.value = { ...values }
    await router.push(listRoute.value)
  } catch (error) {
    if (isUnmounted) return
    const described = describeSaveError(error)
    bannerError.value = described.message
    apiFieldErrors.value = described.fields
  } finally {
    saving.value = false
  }
}

async function onDelete() {
  if (busy.value || !matchId) return
  if (!window.confirm('Excluir esta luta? Essa ação não pode ser desfeita.')) return
  deleting.value = true
  bannerError.value = null
  try {
    await deleteMatch(matchId, auth.token ?? '')
    if (isUnmounted) return
    // The match is gone: leaving can't lose anything
    baseline.value = { ...values }
    await router.push(listRoute.value)
  } catch (error) {
    if (isUnmounted) return
    bannerError.value = describeSaveError(error, MATCH_MESSAGES.deleteGeneric).message
  } finally {
    deleting.value = false
  }
}

const LEAVE_MESSAGE = 'Há alterações não salvas. Deseja sair mesmo assim?'
onBeforeRouteLeave(() => (isDirty.value && !window.confirm(LEAVE_MESSAGE) ? false : undefined))
onBeforeRouteUpdate(() => (isDirty.value && !window.confirm(LEAVE_MESSAGE) ? false : undefined))
function onBeforeUnload(event: BeforeUnloadEvent) {
  if (isDirty.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => {
  isUnmounted = true
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <div class="match-form">
    <OrganizerBreadcrumb :items="breadcrumb" />

    <h1 class="match-form__title text-display-page">
      {{ mode === 'create' ? 'Nova luta' : 'Editar luta' }}
    </h1>
    <p class="match-form__muted text-body-m">Escolha dois robôs inscritos neste campeonato.</p>

    <div v-if="loadState === 'not-editable'" class="match-form__notice">
      <p class="match-form__muted text-body-m">{{ MATCH_MESSAGES.notEditable }}</p>
      <AppButton variant="secondary" :to="listRoute">Voltar para lutas</AppButton>
    </div>

    <LoadStatePanel
      v-else-if="loadState !== 'ready'"
      :state="loadState"
      loading-text="Carregando luta…"
      error-text="Não foi possível carregar a luta."
      :not-found-text="notFound.text"
      :back="notFound.back"
      @retry="load"
    />

    <div v-else-if="robots.length < 2" class="match-form__notice">
      <p class="match-form__muted text-body-m">
        Uma luta precisa de dois robôs inscritos neste campeonato. Cadastre os participantes
        primeiro.
      </p>
      <AppButton :to="{ name: 'participant-create', params: { championshipId } }">
        Adicionar participante
      </AppButton>
    </div>

    <div v-else class="match-form__columns">
      <form
        ref="formEl"
        class="match-form__card"
        novalidate
        aria-labelledby="match-form-heading"
        @submit.prevent="onSubmit"
      >
        <h2 id="match-form-heading" class="match-form__heading text-heading-m">Confronto</h2>

        <div class="match-form__pickers">
          <SelectField
            class="match-form__picker"
            :model-value="values.robotAId"
            label="Robô 1 *"
            placeholder="Escolha um robô"
            :group-label="optionsA.groupLabel"
            :options="optionsA.options"
            :hint="robotHint(robots, values.robotAId)"
            :error="fieldError('robotAId')"
            :disabled="busy"
            required
            @update:model-value="pick('robotAId', $event)"
            @focusout="touched.add('robotAId')"
          />
          <span class="match-form__versus text-heading-s" aria-hidden="true">×</span>
          <SelectField
            class="match-form__picker"
            :model-value="values.robotBId"
            label="Robô 2 *"
            placeholder="Escolha um robô"
            :group-label="optionsB.groupLabel"
            :options="optionsB.options"
            :hint="robotHint(robots, values.robotBId)"
            :error="fieldError('robotBId')"
            :disabled="busy"
            required
            @update:model-value="pick('robotBId', $event)"
            @focusout="touched.add('robotBId')"
          />
        </div>

        <div v-if="bannerError" class="match-form__banner" role="alert">
          <span class="match-form__banner-dot" aria-hidden="true" />
          <p class="match-form__banner-text text-body-s">{{ bannerError }}</p>
        </div>

        <div class="match-form__actions">
          <AppButton
            v-if="mode === 'edit'"
            class="match-form__button match-form__delete"
            variant="destructive"
            :disabled="busy"
            :aria-busy="deleting"
            @click="onDelete"
          >
            Excluir luta
          </AppButton>
          <AppButton class="match-form__button" variant="secondary" :to="listRoute">
            Cancelar
          </AppButton>
          <AppButton class="match-form__button" type="submit" :disabled="busy" :aria-busy="saving">
            {{ mode === 'create' ? 'Criar luta' : 'Salvar luta' }}
          </AppButton>
        </div>
      </form>

      <aside class="match-form__aside">
        <section class="match-form__panel">
          <h2 class="match-form__heading text-heading-s">Prévia na lista</h2>
          <p class="match-form__pair text-heading-xl">
            {{ preview.robotA }}
            <span class="match-form__versus" aria-hidden="true">×</span>
            <span class="visually-hidden">contra</span>
            {{ preview.robotB }}
          </p>
          <p class="match-form__muted text-body-s">{{ preview.teams }}</p>
          <StatusPill class="match-form__pill" v-bind="matchStatePill.waiting" />
          <p class="match-form__muted text-body-s">
            Assim a luta aparece na lista do campeonato. Os lados A e B são definidos na preparação.
          </p>
        </section>
        <section class="match-form__panel">
          <h2 class="match-form__heading text-heading-s">Regras do confronto</h2>
          <p class="match-form__muted text-body-s">
            Dois robôs diferentes, ambos inscritos neste campeonato e da mesma categoria de peso.
            Robôs de outras categorias não aparecem na lista.
          </p>
        </section>
      </aside>
    </div>

    <OrganizerFooter />
  </div>
</template>

<style scoped>
.match-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-28px);
}

.match-form__title,
.match-form__heading,
.match-form__pair {
  color: var(--color-text);
  text-transform: uppercase;
}

.match-form__muted {
  color: var(--color-muted);
}

.match-form__notice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
}

.match-form__columns {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-6);
}

.match-form__card {
  display: flex;
  flex: 999 1 0;
  flex-direction: column;
  gap: var(--space-5);
  min-width: 50%;
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.match-form__pickers {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-4);
}

.match-form__picker {
  flex: 1 1 0;
  min-width: 0;
}

/* Lines the "×" up with the triggers, below their labels */
.match-form__pickers > .match-form__versus {
  align-self: center;
  color: var(--color-muted);
}

.match-form__pair .match-form__versus {
  margin: 0 var(--space-2);
  color: var(--color-muted);
}

.match-form__banner {
  display: flex;
  align-items: center;
  gap: var(--space-10px);
  padding: var(--space-3) var(--space-14px);
  border: 1px solid var(--color-red);
  border-radius: var(--radius-sm);
  background: var(--color-red-dim);
}

.match-form__banner-dot {
  flex-shrink: 0;
  width: var(--size-dot);
  height: var(--size-dot);
  border-radius: var(--radius-pill);
  background: var(--color-red);
}

.match-form__banner-text {
  min-width: 0;
  color: var(--color-red);
}

.match-form__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  padding-top: var(--space-2);
}

.match-form__delete {
  margin-right: auto;
}

.match-form__button {
  min-height: var(--size-control-lg);
}

.match-form__aside {
  display: flex;
  flex: 1 1 var(--size-aside);
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.match-form__panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-panel);
}

.match-form__pair {
  overflow-wrap: anywhere;
}
</style>
```

Note for the `×` between the pickers: the hint under Robô 1 can make the two columns different heights; `align-self: center` may then sit off the triggers. Compare with the screenshot and, if needed, give the `×` a top margin equal to the label height plus gap (use tokens; report it if no token fits).

- [ ] **Step 5: Run tests, type-check, lint**

Run: `cd apps/web && npx vitest run && npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 6: Compare with Figma** in the dev server (demo mode): `/manage/6f1c2a40-0001-4000-8000-000000000001/matches/new`, then the edit page of fight 09 (`/…/matches/6f1c2a40-0005-4000-8000-000000000009/edit`), and fight 07 (`…000000000007/edit`, running: must show the not-editable notice). Fix token-level differences and list the rest in the report.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/views/organizer/MatchFormView.vue apps/web/src/views/organizer/__tests__/MatchFormView.spec.ts
git commit -m "feat(web): build the create and edit match form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Final verification (controller, after the whole-branch review)

- [ ] `cd apps/api && npm test && npm run lint && npm run build`
- [ ] `cd apps/web && npx vitest run && npm run type-check && npm run lint && npm run build-only`
- [ ] End to end with the API (needs Docker): `docker compose up -d` at the repo root, `cd apps/api && npm run migration:run`, start the API, start the web app with `VITE_API_URL=/api npm run dev`, sign in, then:
  1. Create a championship.
  2. Add 3 robots: two "Peso leve", one "Peso pesado". A name typed with extra spaces (`"  Titã  "`) saves as "Titã". A duplicate name (any case) shows "Já existe um robô com esse nome neste campeonato." on the name field. "Salvar e adicionar outro" clears the form and focuses the name.
  3. In Nova luta, picking a "Peso leve" robot as Robô 1 leaves only "Peso leve" robots in Robô 2 (group label "Participantes · Peso leve"), with the picked one disabled ("Já escolhido como Robô 1"). Create the match; it appears under Programadas.
  4. Edit it to swap Robô 2, then delete it from the edit form.
  5. Create a match again and try to remove one of its robots in Participantes: the inline message appears and the row stays. Change that robot's weight class: the weight-class error appears.
  6. Keyboard only: complete step 3 without the mouse.
- [ ] Repeat steps 2–5 with `VITE_API_URL` unset (demo mode) and confirm the same messages.
- [ ] If Docker isn't available, say so to the user instead of claiming the end-to-end check passed.
- [ ] Git: `git branch --show-current` prints `championship-management`, `git status` is clean, and `git status -sb` shows the branch ahead of its remote by the new commits. Nothing was pushed, no PR was opened or edited, and `main` is untouched.

## Execution notes for the controller (subagent-driven development)

- Dispatch one implementer per task, in order (0 → 15). Tasks depend on earlier interfaces, so don't run them in parallel. Give each implementer: this task's full text, the Global Constraints, the Resolved ambiguities, and the spec path.
- After each task, a reviewer checks it against the task text, the spec, the Global Constraints and the Review Focus line that names that task.
- Implementers on view tasks (8, 9, 10, 12, 13, 15) must report Figma differences they couldn't resolve and any new token they think is needed, instead of hardcoding values.
- Work in the current checkout on `championship-management` (it already has a draft PR). No worktree, no new branch. Every task ends with a local commit. Never push, never open or update a PR, never merge into `main`. Tell implementers this in each dispatch.
- Phases A–E are groupings only, not PR boundaries.
- After Task 15, run the whole-branch review and the final verification, then stop and report to the user. Skip `superpowers:finishing-a-development-branch`: its merge, push and PR options are all ruled out here.

