# 09 — Development Workflow

## Initial Setup

```bash
# 1. Clone the repository
git clone https://github.com/gauravprwl14/nestjs-boilerplate.git
cd nestjs-boilerplate

# 2. Install dependencies
npm install

# 3. Copy and configure environment
cp .env.example .env.development
# Edit .env.development with your local values

# 4. Start infrastructure (PostgreSQL only; Grafana stack is optional)
docker compose up -d postgres
# Optional: docker compose up -d otel-collector tempo loki prometheus grafana

# 5. Run database migrations
npm run prisma:migrate:dev

# 6. Generate Prisma client
npm run prisma:generate

# 7. Seed (2 companies, 7 users, department trees, sample tweets)
npm run prisma:seed
# Note the printed user UUIDs — you'll need them for x-user-id.

# 8. Start the app in development mode
npm run start:dev
```

## Environment Files

| File | Purpose |
|------|---------|
| `.env.development` | Local development values |
| `.env.test` | Test runner values (in-memory or test DB) |
| `.env.production` | Production values (never commit — use secrets manager) |

## Common Commands

```bash
# Development
npm run start:dev          # Watch mode with hot reload
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

| Type | When |
|------|------|
| `feat` | New feature or endpoint |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change without feature or fix |
| `test` | Adding or fixing tests |
| `chore` | Build, tooling, dependency updates |
| `perf` | Performance improvement |

## Running the Full Stack

```bash
# Start Postgres
docker compose up -d postgres

# (Optional) add the observability stack
docker compose up -d otel-collector tempo loki prometheus grafana

# View logs
docker compose logs -f app

# Swagger UI (mock auth: set x-user-id header via Swagger's "Authorize" button)
open http://localhost:3000/docs

# Grafana UI (only when OTel stack is running)
open http://localhost:3001
```
