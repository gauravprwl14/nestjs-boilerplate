# ai-native-nestjs-backend

An AI-native NestJS 11 boilerplate demonstrating production-ready backend patterns, with a structured documentation system designed for AI-assisted development and autonomous doc-sync.

**Domain:** Todo app (TodoLists → TodoItems → Tags)
**Stack:** NestJS 11 · Express · Prisma 7 · PostgreSQL 16 · Redis 7 · BullMQ · JWT + API Key auth · OpenTelemetry · Grafana (Tempo, Loki, Prometheus)

---

## Why This Repo

This is not just a NestJS starter — it is a complete reference for running a fintech-grade backend with AI tooling deeply integrated:

- **Structured 3-layer documentation** (Router / Room / Output) that AI agents can navigate
- **Autonomous doc-sync** that keeps docs aligned with code changes automatically
- **AI-aware configuration** via `CLAUDE.md` and `.claude/skills/`
- **Production concerns baked in**: CLS, OTel, Pino, rate limiting, request IDs, graceful shutdown
- **Domain-prefixed error system** (`GEN`, `VAL`, `AUT`, `AUZ`, `DAT`, `SRV`) with full error taxonomy

---

## Quick Start

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- npm 10+

### Run locally

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file and adjust if needed
cp .env.example .env

# 3. Start backing services (Postgres, Redis, Grafana stack)
docker-compose up -d

# 4. Generate Prisma client and run migrations
npm run prisma:generate
npm run prisma:migrate:dev

# 5. Start the dev server
npm run start:dev
```

API available at `http://localhost:3000/api/v1/*`
Swagger UI at `http://localhost:3000/api/docs`
Grafana at `http://localhost:3001`

### Useful scripts

| Command                 | Purpose                                 |
| ----------------------- | --------------------------------------- |
| `npm run start:dev`     | Dev server with watch mode              |
| `npm run build`         | Production build                        |
| `npm test`              | Unit tests                              |
| `npm run test:cov`      | Unit tests with coverage (target ≥ 80%) |
| `npm run test:e2e`      | End-to-end tests                        |
| `npm run lint`          | ESLint with auto-fix                    |
| `npm run type:check`    | TypeScript type check without emit      |
| `npm run prisma:studio` | Open Prisma Studio                      |

---

## Project Structure

```
src/
├── app.module.ts          # Root module; wires all feature modules
├── main.ts                # Entry; bootstrap + OTel SDK init
├── bootstrap/             # Graceful shutdown, signal handlers
├── config/                # Zod-validated env config; AppConfigService
├── common/                # Filters, middleware, interceptors, decorators, pipes
├── database/              # PrismaService, PrismaModule, BaseRepository
├── errors/                # ErrorException + domain error-code constants
├── logger/                # AppLogger (Pino), sanitizer, trace-context util
├── telemetry/             # OTel SDK, TelemetryService, @Trace decorator
├── queue/                 # BullMQ QueueModule (Redis-backed)
└── modules/
    ├── auth/              # JWT + API Key auth
    ├── users/             # User profile
    ├── health/            # /health endpoint
    ├── todo-lists/        # TodoList CRUD
    ├── todo-items/        # TodoItem CRUD + status transitions + BullMQ
    └── tags/              # Tag CRUD + assign/remove
```

---

## Documentation System

Documentation is organized in a **3-layer architecture** so AI agents load exactly what's relevant to the task at hand, nothing more:

| Layer         | Role                              | Files                                                                                                                  |
| ------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **1. Router** | Loaded first in every session     | `CLAUDE.md` (root)                                                                                                     |
| **2. Room**   | Standing instructions per domain  | `docs/CONTEXT.md` + sub-folder `CONTEXT.md` files                                                                      |
| **3. Output** | Reference docs and specifications | `docs/architecture/`, `docs/coding-guidelines/`, `docs/guides/`, `docs/diagrams/`, `docs/prd/`, `docs/infrastructure/` |

Start at `CLAUDE.md` for the routing table that maps tasks (e.g., "add a feature module", "fix error handling", "work on observability") to the specific docs needed for that task.

### Documentation Index

- [`CLAUDE.md`](./CLAUDE.md) — AI router with folder map, routing table, conventions, error system, logger contract
- [`docs/architecture/`](./docs/architecture/) — High-level, service, database design, auth flow
- [`docs/coding-guidelines/`](./docs/coding-guidelines/) — 11 files covering project structure, modules, naming, DI, patterns, errors, logging, testing
- [`docs/guides/`](./docs/guides/) — Feature deep-dives (`FOR-Authentication.md`, `FOR-Error-Handling.md`, `FOR-Observability.md`, `FOR-Todo-Module.md`)
- [`docs/diagrams/`](./docs/diagrams/) — Mermaid sequence diagrams (auth, error handling, observability, todo CRUD)
- [`docs/prd/`](./docs/prd/) — Product requirements for the Todo app
- [`docs/infrastructure/`](./docs/infrastructure/) — Docker setup, env config, deployment checklist, Grafana stack
- [`docs/task-tracker/`](./docs/task-tracker/) — Project status tracking

---

## Autonomous Doc-Sync

This project has a **4-component doc-sync system** that keeps documentation aligned with code automatically:

### 1. `/sync-docs` skill

A Claude Code skill that reads the current git diff, scans **all** documentation across every layer (PRD, architecture, guides, diagrams, `CLAUDE.md`, `CONTEXT.md` files), and updates anything affected by the code changes. It:

- Never auto-commits — changes are left unstaged for your review
- Creates new docs for new modules (e.g., new module → new `docs/guides/FOR-<Name>.md`)
- Archives obsolete docs to `docs/archival/` (never deletes) — you confirm deletion after review
- Flags Mermaid and sequence diagrams for manual visual verification

**Usage:**

```bash
/sync-docs                    # Sync against current HEAD (staged + unstaged)
/sync-docs --branch main      # Sync against a specific branch baseline
```

Definition: [`.claude/skills/sync-docs/SKILL.md`](./.claude/skills/sync-docs/SKILL.md)

### 2. `Stop` + `SubagentStop` hooks

Prompt-based hooks in [`.claude/settings.json`](./.claude/settings.json) that fire after every Claude Code response (main session or subagent/worktree). They detect code changes without doc changes and gently remind you:

> _"Code changes detected in src/ but no documentation changes. Documentation may be stale. Run /sync-docs to update affected docs before committing, or proceed if intentional."_

Mode-agnostic — works in main sessions, subagents, and git worktrees.

### 3. Husky pre-commit check

[`.husky/check-docs-sync.sh`](./.husky/check-docs-sync.sh) runs during `git commit`. If you stage code files under `src/`, `test/`, `prisma/schema.prisma`, or root config files (`package.json`, `tsconfig.json`, `nest-cli.json`, `docker-compose.yml`) **without** staging any doc files, it prints a warning and blocks the commit.

Three bypass options (when you know docs don't need updating):

```bash
# 1. Env var
SKIP_DOC_CHECK=1 git commit -m "..."

# 2. Commit message flag
git commit -m "fix: trivial typo [skip-doc-check]"

# 3. Skip all hooks (nuclear option)
git commit --no-verify -m "..."
```

### 4. Archival pattern

Obsolete docs move to [`docs/archival/`](./docs/archival/) with a date prefix (e.g., `2026-04-16_FOR-OldModule.md`) so nothing is ever lost. You review and permanently delete only when confident.

### Full design

- Spec: [`docs/superpowers/specs/2026-04-16-doc-auto-sync-design.md`](./docs/superpowers/specs/2026-04-16-doc-auto-sync-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-04-16-doc-auto-sync.md`](./docs/superpowers/plans/2026-04-16-doc-auto-sync.md)

---

## Error System

Errors are `ErrorException` instances (extends native `Error`, not `HttpException`). Domain error-code constants (`GEN`, `VAL`, `AUT`, `AUZ`, `DAT`, `SRV`) are the API — no string keys, no factory class.

```typescript
import { AUT, DAT, VAL } from '@errors/error-codes';
import { ErrorException } from '@errors/types/error-exception';

throw new ErrorException(AUT.UNAUTHENTICATED);
throw new ErrorException(DAT.NOT_FOUND, { message: `User ${id} not found` });
throw ErrorException.notFound('User', id);
throw ErrorException.validation(zodError);
```

Error-code format: `PREFIX` (3 uppercase letters) + 4-digit zero-padded number (e.g., `DAT0001`, `AUT0006`).

Deep dive: [`docs/guides/FOR-Error-Handling.md`](./docs/guides/FOR-Error-Handling.md) and [`docs/coding-guidelines/07-error-handling.md`](./docs/coding-guidelines/07-error-handling.md)

---

## Observability

- **Tracing:** OpenTelemetry SDK auto-instruments HTTP, Prisma, BullMQ. Traces exported to Tempo via OTel Collector.
- **Logs:** Pino-backed `AppLogger` emits structured JSON with `traceId`, `requestId`, `userId` propagated via `ClsService`. Loki scrapes.
- **Metrics:** Prometheus scrapes `/metrics`. Dashboards provisioned in Grafana.

Logger contract has three methods with fixed semantics:

```typescript
logger.logEvent('user.created', { attributes: { userId } }); // Always INFO
logger.logError('db.query.failed', error, { attributes }); // Always ERROR
logger.log('process exiting', { level: LogLevel.FATAL }); // Configurable
```

Deep dive: [`docs/guides/FOR-Observability.md`](./docs/guides/FOR-Observability.md)

---

## API Versioning

Routes use NestJS URI versioning: `/api/v{version}/path`. All current controllers are v1. New versions live in sibling controllers with `@Controller({ path: '...', version: '2' })` — v1 keeps working.

---

## Testing

- **Pattern:** AAA (Arrange / Act / Assert)
- **Unit tests:** Co-located `*.spec.ts` next to source
- **E2E tests:** `test/` directory, `*.e2e-spec.ts` suffix
- **Mock factories:** `test/helpers/`
- **Never** call real databases in unit tests — mock `PrismaService` via `test/helpers/prisma.mock.ts`
- **Coverage target:** ≥ 80% lines on services and repositories

---

## Contributing Workflow

1. Branch from `main`
2. Make code changes
3. When Claude Code reminds you (via `Stop` hook) or before committing: run `/sync-docs`
4. Review the sync output — unstaged doc changes and any flagged diagrams
5. `git commit` — pre-commit hook validates code + docs are staged together (or you use a bypass)
6. Open a PR

---

## License

Private — internal boilerplate.
