# 09 — Development Workflow

## Running the app — pick one path

> The project uses **Podman** in local dev (`podman compose`). All commands
> below work identically with `docker compose` — they share the Compose spec.
> Substitute whichever tool you have installed.

### Path A — Everything in containers (recommended first-time)

Zero host deps beyond a container runtime. Starts app + Postgres + the
observability stack, **auto-runs migrations**, **auto-seeds** (idempotent).

```bash
git clone https://github.com/gauravprwl14/nestjs-boilerplate.git
cd nestjs-boilerplate
podman compose up -d
```

- App: <http://localhost:3000> · Swagger at `/docs`
- Grafana: <http://localhost:3001> (anonymous admin)
- Postgres: mapped to host port `5433` (container port `5432`)

The `app` service's command is:

```bash
prisma migrate deploy && npm run prisma:seed && npm run start:dev
```

Source is bind-mounted (`.:/app`), so hot reload works without rebuilding.

```bash
podman compose logs -f app            # stream app logs
podman compose down                   # stop (keeps postgres volume)
podman compose down -v                # stop + wipe all data
```

### Path B — App on host, infra in containers (fastest dev loop)

You get IDE/debugger/host-`node_modules`, no need to install Postgres locally.

```bash
# 1. Start just the DB (add the observability chain if you want it)
podman compose up -d postgres
# Optional:
podman compose up -d otel-collector tempo loki prometheus grafana

# 2. Point DATABASE_URL at the host-mapped port (5433).
#    .env.development is pre-configured for container DNS (host: postgres).
#    For host-run, override via .env.local or a shell export:
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/enterprise_twitter_dev?schema=public"

# 3. Install + run (migrate + seed + start:dev in one go)
npm install
npm run start:dev:seeded
```

### Path C — Everything on host

Needs a local **Postgres 16** with an empty `enterprise_twitter_dev` database.

```bash
# 1. Set DATABASE_URL for your local Postgres (port 5432 by default)
export DATABASE_URL="postgresql://<user>:<pwd>@localhost:5432/enterprise_twitter_dev?schema=public"

# 2. Install + run
npm install
npm run start:dev:seeded
```

---

## Starting individual Compose services

`podman compose up -d <service>` starts a service plus its `depends_on` chain.

| Goal                               | Command                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| Just the DB                        | `podman compose up -d postgres`                                              |
| DB + observability (no app)        | `podman compose up -d postgres otel-collector tempo loki prometheus grafana` |
| Only the observability UIs         | `podman compose up -d prometheus tempo loki grafana`                         |
| Stop one service                   | `podman compose stop <service>`                                              |
| Restart one service (re-reads env) | `podman compose up -d --force-recreate --no-deps <service>`                  |
| Shell into a running service       | `podman compose exec <service> sh`                                           |

> **Note:** `app.depends_on.otel-collector` pulls tempo + loki along whenever
> `app` starts. For a truly minimal boot (app + postgres only), comment that
> dep out in `docker-compose.yml`.

---

## Manual seed / re-seed

The seed is idempotent — `npm run prisma:seed` no-ops if data already exists.
To force a fresh seed, truncate first:

```bash
# In the compose stack
podman compose exec postgres psql -U postgres -d enterprise_twitter_dev \
  -c 'TRUNCATE company, department, "user", user_department, tweet, tweet_department CASCADE'
podman compose restart app            # compose auto-re-seeds on app boot
# or:
npm run prisma:seed                   # if running on host
```

## Environment Files

| File               | Loaded by                                                   | Purpose                                                                                                                          |
| ------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `.env`             | `docker compose` (for `${VAR}` interpolation)               | Compose-only: Postgres creds + observability URLs (e.g. `TEMPO_URL`). Not read by the app.                                       |
| `.env.development` | The app (via `env_file:` in compose, or host start scripts) | App config for local dev — `DATABASE_URL`, `OTEL_*`, etc. Defaults to **container DNS** (`postgres`/`otel-collector` hostnames). |
| `.env.test`        | Jest                                                        | Test DB values                                                                                                                   |
| `.env.production`  | The app in prod                                             | Never committed — use a secrets manager                                                                                          |
| `.env.local`       | Loaded after `.env.development` if present; git-ignored     | Per-developer overrides (e.g. host `DATABASE_URL` for Path B)                                                                    |

## Common Commands

```bash
# Development
npm run start:dev          # Watch mode with hot reload
npm run start:dev:seeded   # prisma migrate:deploy + prisma:seed + start:dev
npm run start:debug        # Debug mode (inspector on port 9229)

# Database
npm run prisma:migrate:dev -- --name <description>   # Create + apply migration
npm run prisma:migrate:deploy                         # Apply pending migrations (production)
npm run prisma:migrate:reset                          # Reset DB and re-apply all migrations (dev only)
npm run prisma:studio                                 # Open Prisma Studio GUI
npm run prisma:seed                                   # Run seed script

# Code quality
npm run lint               # ESLint + auto-fix
npm run format             # Prettier format
npm run type:check         # TypeScript type checking (no emit)

# Build
npm run build              # Compile to dist/

# Testing
npm run test               # Run all unit tests
npm run test:watch         # Watch mode
npm run test:cov           # Coverage report
npm run test:e2e           # End-to-end tests

# Production
npm run start:prod         # Run compiled output from dist/
```

## Git Workflow

```bash
# Feature branch
git checkout -b feat/<short-description>

# Pre-commit hooks (Husky + lint-staged) run automatically:
# - ESLint --fix on *.ts
# - Prettier on *.ts, *.json, *.md
# - commitlint enforces conventional commits

# Commit message format (commitlint conventional)
git commit -m "feat(tweets): add pagination cursor to timeline"
git commit -m "fix(departments): reject cross-tenant parentId"
git commit -m "docs: update tweets-sequence diagram"
```

## Commit Types

| Type       | When                               |
| ---------- | ---------------------------------- |
| `feat`     | New feature or endpoint            |
| `fix`      | Bug fix                            |
| `docs`     | Documentation only                 |
| `refactor` | Code change without feature or fix |
| `test`     | Adding or fixing tests             |
| `chore`    | Build, tooling, dependency updates |
| `perf`     | Performance improvement            |
