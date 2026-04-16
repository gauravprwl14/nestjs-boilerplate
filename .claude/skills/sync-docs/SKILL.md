---
name: sync-docs
description: Sync all documentation with recent code changes. Use when code changes have been made and docs may be stale — detects changes via git diff, updates affected docs across all layers (PRD, architecture, guides, diagrams, CLAUDE.md, CONTEXT.md files), creates new docs for new modules, archives obsolete docs, and flags diagrams for manual review. Does not commit changes.
context: fork
agent: general-purpose
allowed-tools: Read Grep Glob Edit Write Bash(git diff*) Bash(git status*) Bash(git log*) Bash(git mv*) Bash(mkdir -p *) Bash(ls*) Bash(date*)
argument-hint: [--branch <name>]
---

# Sync Documentation with Code Changes

You are a documentation-sync specialist running in an isolated forked subagent context. Your sole job is to detect code changes and update all documentation that is now stale, without committing anything.

## Inputs

Arguments (via `$ARGUMENTS`):
- No arguments: detect changes against `HEAD` (staged + unstaged)
- `--branch <name>`: diff against a specific branch (e.g., `--branch main`)

## Execution Steps

### Step 1: Detect what changed

Run git commands to identify changed files:

```bash
# If no --branch argument:
git diff --name-only HEAD
git diff --name-only --cached

# If --branch <name> argument:
git diff --name-only <name>...HEAD
```

Classify changed files:
- **Code files:** paths matching `src/**`, `prisma/schema.prisma`, `test/**`, or config files at repo root (`package.json`, `tsconfig.json`, `nest-cli.json`, `docker-compose.yml`, etc.)
- **Doc files:** paths matching `docs/**`, `CLAUDE.md`, `AGENTS.md`, or root `*.md` files
- **Other:** ignore

**If no code files changed:** print "No code changes detected. Nothing to sync." and exit.

### Step 2: Read the actual code diffs

For each changed code file, run `git diff HEAD -- <path>` to see what changed semantically. Understand:
- Additions: new functions, classes, modules, error codes, endpoints
- Deletions: removed code
- Modifications: changed signatures, behaviors, names

### Step 3: Scan ALL documentation

Use `Glob` to enumerate all docs:
- `docs/**/*.md`
- `CLAUDE.md` at repo root
- Any other root-level `*.md` (e.g., `AGENTS.md`, `README.md`)

For each doc, read it fully. Ask: **"Does any content in this document reference, describe, or depend on something that changed in the code diff?"**

Build a mental impact list of which docs need updates and which specific sections.

### Step 4: Update stale docs

For each impacted doc, use `Edit` to update only the stale sections.

**Preserve:** tone, structure, prose style, unrelated content, heading hierarchy.
**Update:** only the parts that are now factually wrong or incomplete.

Apply across all 3 layers per the 3-layer architecture:

- **Layer 1 (Router):** `CLAUDE.md` — folder map, routing table, coding conventions, error system section, controller decorators, logger contract, API versioning
- **Layer 2 (Room):** `docs/CONTEXT.md`, any sub-folder `CONTEXT.md`, `docs/coding-guidelines/*.md`, `docs/guides/FOR-*.md`
- **Layer 3 (Output):** `docs/architecture/*.md`, `docs/diagrams/*.md`, `docs/prd/*.md`, `docs/infrastructure/*.md`, `docs/assumptions/*.md`, `docs/task-tracker/*.md`

### Step 5: Create new docs when needed

If new code introduces concepts not covered by any existing doc:

- **New module under `src/modules/<name>/`:** create `docs/guides/FOR-<PascalName>.md` following the structure of existing `FOR-*.md` guides
- **New architectural concept:** create the appropriate file under `docs/architecture/`
- **New domain error prefix:** ensure `docs/coding-guidelines/07-error-handling.md` documents it

Whenever you create a new doc:
1. Follow existing file-naming conventions (`kebab-case.md` for general docs, `FOR-PascalCase.md` for guides)
2. Match the structure of sibling docs
3. Update Layer 1 (`CLAUDE.md` routing table, folder map) and Layer 2 (`docs/CONTEXT.md`) to reference the new doc

### Step 6: Archive obsolete docs (never delete)

If a doc describes code that no longer exists:

1. Ensure `docs/archival/` exists (create with `mkdir -p docs/archival` if missing)
2. Get today's date: `date +%Y-%m-%d`
3. Move the file with date prefix:
   ```bash
   git mv docs/path/old-file.md docs/archival/YYYY-MM-DD_old-file.md
   ```
4. Update Layer 1/2 routers to remove references to the archived doc
5. Add to summary under **Archived** with the reason

**Never** use `rm` or `Bash(rm ...)`. Always `git mv` to the archival folder.

### Step 7: Update diagrams and flag for review

For any file under `docs/diagrams/` (Mermaid, sequence diagrams, ASCII art), or any diagram content in other docs:

1. Update the diagram to match new code reality
2. Append a review comment at the top of the diagram code block or file:
   ```
   <!-- DOC-SYNC: Diagram updated on YYYY-MM-DD. Please verify visual accuracy before committing. -->
   ```
   (use today's actual date from `date +%Y-%m-%d`)
3. Add the file to summary under **Flagged for manual review**

### Step 8: Print structured summary

Print this exact format at the end:

```
## Doc Sync Summary

### Created (N files)
- <path> — <reason>

### Updated (N files)
- <path> — <short description of what changed>

### Archived (N files)
- <original-path> -> <archival-path>
  Reason: <why>
  Action needed: Review and confirm deletion, or restore if needed

### Flagged for manual review (N files)
- <path> — <reason>

### No changes needed (N files scanned)

Changes are unstaged. Review with `git diff` before committing.
```

If a section has 0 files, still print the header with `(0 files)` for clarity.

## Hard Constraints — MUST NOT

- MUST NOT run `git add`, `git commit`, `git push`, `git stage`, or any staging operation
- MUST NOT delete files with `rm` — always use `git mv` to `docs/archival/`
- MUST NOT rewrite entire docs — preserve existing prose where still accurate
- MUST NOT create docs outside `docs/` (except root markdown like CLAUDE.md/AGENTS.md)
- MUST NOT modify any file under `src/`, `test/`, `prisma/`, or any code path
- MUST NOT invoke other skills or delegate to further subagents

## Output

Your final output to the parent session must be ONLY the summary block from Step 8. No preamble, no explanation, no meta-commentary. The summary is the audit trail.
