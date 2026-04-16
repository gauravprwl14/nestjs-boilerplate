# Doc Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an autonomous documentation-sync system (skill + hooks + pre-commit) that detects code changes and updates all affected docs across all 3 layers (Router / Room / Output) without auto-committing.

**Architecture:** Four-component system: (1) `/sync-docs` skill — forked subagent that reads git diff, scans all docs, updates/creates/archives; (2) `Stop` hook — prompt-type gate reminding user to run `/sync-docs` after code changes; (3) `SubagentStop` hook — same gate for subagent/worktree flows; (4) Husky pre-commit script — warns if staged code has no accompanying doc changes, with bypass mechanisms.

**Tech Stack:** Claude Code skills (SKILL.md), Claude Code hooks (settings.json), Husky + shell scripts, git, markdown. No Node/TypeScript code required.

**Spec reference:** `docs/superpowers/specs/2026-04-16-doc-auto-sync-design.md`

---

## File Structure

### Files to create

| File | Responsibility |
|------|---------------|
| `.claude/skills/sync-docs/SKILL.md` | The doc-sync agent skill — frontmatter + instructions to the forked subagent |
| `.husky/check-docs-sync.sh` | Pre-commit script that warns if code is staged without docs |
| `docs/archival/.gitkeep` | Placeholder so the archival directory exists in git (skill uses it) |

### Files to modify

| File | Responsibility | Change |
|------|---------------|--------|
| `.claude/settings.json` | Project-level Claude Code config | Add `Stop` and `SubagentStop` hooks |
| `.claude/settings.local.json` | Local permissions | Add permission for `sh .husky/check-docs-sync.sh` |
| `.husky/pre-commit` | Husky pre-commit chain | Add call to `check-docs-sync.sh` after lint-staged |

### Boundaries

Each file has one clear responsibility:
- **`SKILL.md`** contains only the agent prompt — no hook config, no pre-commit logic
- **`settings.json`** contains only the hook wiring — no skill content
- **`check-docs-sync.sh`** contains only the pre-commit logic — no hook or skill logic
- **`pre-commit`** only orchestrates the chain (lint-staged → doc check)

This separation means any component can be modified, disabled, or tested independently.

---

## Task 1: Create archival directory placeholder

**Files:**
- Create: `docs/archival/.gitkeep`

- [ ] **Step 1: Create the archival directory with a .gitkeep placeholder**

```bash
mkdir -p docs/archival
touch docs/archival/.gitkeep
```

- [ ] **Step 2: Verify directory is tracked**

Run:
```bash
git status docs/archival/
```

Expected output: shows `docs/archival/.gitkeep` as untracked.

- [ ] **Step 3: Stage and commit**

```bash
git add docs/archival/.gitkeep
git commit -m "chore: add docs/archival placeholder for doc-sync system"
```

---

## Task 2: Create the `/sync-docs` skill

**Files:**
- Create: `.claude/skills/sync-docs/SKILL.md`

- [ ] **Step 1: Create the skill directory**

```bash
mkdir -p .claude/skills/sync-docs
```

- [ ] **Step 2: Write the SKILL.md file**

Create `.claude/skills/sync-docs/SKILL.md` with this exact content:

````markdown
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
````

- [ ] **Step 3: Verify the skill is discovered**

Run:
```bash
ls -la .claude/skills/sync-docs/
```

Expected output: `SKILL.md` present and readable.

- [ ] **Step 4: Stage and commit**

```bash
git add .claude/skills/sync-docs/SKILL.md
git commit -m "feat: add /sync-docs skill for autonomous doc synchronization"
```

---

## Task 3: Add `Stop` and `SubagentStop` hooks

**Files:**
- Modify: `.claude/settings.json`

- [ ] **Step 1: Read current settings.json**

Run:
```bash
cat .claude/settings.json
```

Expected current content: `{}` (empty object).

- [ ] **Step 2: Write the new settings.json with hooks**

Overwrite `.claude/settings.json` with this exact content:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "You are a doc-sync gate. Check the following conditions in order:\n\n1. If stop_hook_active is true in the input JSON, return {\"ok\": true} immediately to prevent infinite loops.\n\n2. Run `git diff --name-only HEAD` and `git diff --name-only --cached`. Classify changed files:\n   - Code: src/**, prisma/schema.prisma\n   - Docs: docs/**, CLAUDE.md, AGENTS.md, root *.md\n\n3. Decision tree:\n   - If no code files changed: return {\"ok\": true}\n   - If both code AND doc files changed: assume docs were already synced, return {\"ok\": true}\n   - If only code files changed (no doc files): return {\"ok\": false, \"reason\": \"Code changes detected in src/ but no documentation changes. Documentation may be stale. Run /sync-docs to update affected docs before committing, or proceed if intentional.\"}\n\nReturn ONLY the JSON response, nothing else."
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "You are a doc-sync gate. Check the following conditions in order:\n\n1. If stop_hook_active is true in the input JSON, return {\"ok\": true} immediately to prevent infinite loops.\n\n2. Run `git diff --name-only HEAD` and `git diff --name-only --cached`. Classify changed files:\n   - Code: src/**, prisma/schema.prisma\n   - Docs: docs/**, CLAUDE.md, AGENTS.md, root *.md\n\n3. Decision tree:\n   - If no code files changed: return {\"ok\": true}\n   - If both code AND doc files changed: assume docs were already synced, return {\"ok\": true}\n   - If only code files changed (no doc files): return {\"ok\": false, \"reason\": \"Code changes detected in src/ but no documentation changes. Documentation may be stale. Run /sync-docs to update affected docs before committing, or proceed if intentional.\"}\n\nReturn ONLY the JSON response, nothing else."
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 3: Validate JSON**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json', 'utf8')); console.log('Valid JSON');"
```

Expected output: `Valid JSON`

- [ ] **Step 4: Stage and commit**

```bash
git add .claude/settings.json
git commit -m "feat: add Stop and SubagentStop hooks for doc-sync reminder"
```

---

## Task 4: Create pre-commit doc-sync check script

**Files:**
- Create: `.husky/check-docs-sync.sh`

- [ ] **Step 1: Write the script**

Create `.husky/check-docs-sync.sh` with this exact content:

```sh
#!/usr/bin/env sh
# Doc-sync pre-commit check
# Warns if code files are staged without any accompanying doc changes.
# Bypass options:
#   - Environment: SKIP_DOC_CHECK=1 git commit ...
#   - Commit message: include [skip-doc-check] in the message
#   - All hooks: git commit --no-verify ...

# Escape hatch 1: environment variable
if [ "${SKIP_DOC_CHECK:-0}" = "1" ]; then
  exit 0
fi

# Escape hatch 2: commit message bypass flag
COMMIT_MSG_FILE=".git/COMMIT_EDITMSG"
if [ -f "$COMMIT_MSG_FILE" ] && grep -q "\[skip-doc-check\]" "$COMMIT_MSG_FILE" 2>/dev/null; then
  exit 0
fi

# Get staged files
STAGED=$(git diff --cached --name-only)

# No staged files at all -> nothing to do
if [ -z "$STAGED" ]; then
  exit 0
fi

# Classify staged files
CODE_FILES=$(echo "$STAGED" | grep -E '^(src/|prisma/schema\.prisma$)' || true)
DOC_FILES=$(echo "$STAGED" | grep -E '^(docs/|CLAUDE\.md$|AGENTS\.md$|[^/]+\.md$)' || true)

# No code files staged -> no warning needed
if [ -z "$CODE_FILES" ]; then
  exit 0
fi

# Code AND doc files staged -> assume sync was performed
if [ -n "$DOC_FILES" ]; then
  exit 0
fi

# Code files staged but NO doc files -> warn and block
cat <<EOF

⚠️  Documentation Sync Check

You are committing code changes without any doc changes:

  Code files staged:
$(echo "$CODE_FILES" | sed 's/^/    M /')

  Doc files staged: (none)

Documentation may be out of date. Options:
  1. Abort, run /sync-docs in Claude Code, then re-commit (recommended)
  2. Continue anyway — re-run with SKIP_DOC_CHECK=1
  3. Add [skip-doc-check] to your commit message

To bypass:              SKIP_DOC_CHECK=1 git commit ...
To bypass all hooks:    git commit --no-verify ...

EOF

exit 1
```

- [ ] **Step 2: Make script executable**

Run:
```bash
chmod +x .husky/check-docs-sync.sh
```

- [ ] **Step 3: Test the script logic — no staged files**

Run:
```bash
sh .husky/check-docs-sync.sh
echo "Exit: $?"
```

Expected output: `Exit: 0` (no staged files means nothing to check).

- [ ] **Step 4: Test the script logic — simulate code-only stage**

Create a temporary test:
```bash
# Create dummy staged change
mkdir -p /tmp/doc-sync-test
cd /tmp/doc-sync-test
git init -q
mkdir -p src
echo "export const x = 1;" > src/test.ts
git add src/test.ts
# Copy the check script in
cp /Users/gauravporwal/Sites/projects/gp/ai-native-nestjs-backend/.husky/check-docs-sync.sh .
sh check-docs-sync.sh
echo "Exit: $?"
# Cleanup
cd /Users/gauravporwal/Sites/projects/gp/ai-native-nestjs-backend
rm -rf /tmp/doc-sync-test
```

Expected: The warning message prints and `Exit: 1`.

- [ ] **Step 5: Test bypass**

```bash
mkdir -p /tmp/doc-sync-test2
cd /tmp/doc-sync-test2
git init -q
mkdir -p src
echo "export const x = 1;" > src/test.ts
git add src/test.ts
cp /Users/gauravporwal/Sites/projects/gp/ai-native-nestjs-backend/.husky/check-docs-sync.sh .
SKIP_DOC_CHECK=1 sh check-docs-sync.sh
echo "Exit: $?"
cd /Users/gauravporwal/Sites/projects/gp/ai-native-nestjs-backend
rm -rf /tmp/doc-sync-test2
```

Expected: `Exit: 0` (bypass worked).

- [ ] **Step 6: Stage and commit the script**

```bash
git add .husky/check-docs-sync.sh
git commit -m "feat: add pre-commit doc-sync warning script"
```

---

## Task 5: Wire the pre-commit script into Husky

**Files:**
- Modify: `.husky/pre-commit`

- [ ] **Step 1: Read current pre-commit**

Run:
```bash
cat .husky/pre-commit
```

Expected current content:
```
npx lint-staged
```

- [ ] **Step 2: Update pre-commit to chain both checks**

Overwrite `.husky/pre-commit` with this exact content:

```sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run lint-staged first so formatting/linting always applies
npx lint-staged

# Run doc-sync check after lint-staged
"$(dirname -- "$0")/check-docs-sync.sh"
```

- [ ] **Step 3: Ensure pre-commit remains executable**

Run:
```bash
chmod +x .husky/pre-commit
ls -la .husky/pre-commit
```

Expected: file shows execute permissions (e.g., `-rwxr-xr-x`).

- [ ] **Step 4: Stage and commit**

```bash
git add .husky/pre-commit
git commit -m "feat: chain doc-sync check into Husky pre-commit"
```

---

## Task 6: Update local permissions for the pre-commit script

**Files:**
- Modify: `.claude/settings.local.json`

- [ ] **Step 1: Read current settings.local.json**

Run:
```bash
cat .claude/settings.local.json
```

Current content:
```json
{
  "permissions": {
    "allow": [
      "Bash(printf 'npx lint-staged\\\\n')",
      "Bash(printf 'npx --no -- commitlint --edit \"$1\"\\\\n')"
    ]
  }
}
```

- [ ] **Step 2: Update with new permission**

Overwrite `.claude/settings.local.json` with this exact content:

```json
{
  "permissions": {
    "allow": [
      "Bash(printf 'npx lint-staged\\\\n')",
      "Bash(printf 'npx --no -- commitlint --edit \"$1\"\\\\n')",
      "Bash(sh .husky/check-docs-sync.sh)",
      "Bash(chmod +x .husky/*)"
    ]
  }
}
```

- [ ] **Step 3: Validate JSON**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('.claude/settings.local.json', 'utf8')); console.log('Valid JSON');"
```

Expected output: `Valid JSON`

- [ ] **Step 4: Note — settings.local.json is gitignored**

This file is local-only per Claude Code convention. No commit needed.

Verify:
```bash
git status .claude/settings.local.json
```

Expected: file is either untracked+ignored or not listed (gitignored).

---

## Task 7: End-to-end verification

**Files:**
- No file changes — this is verification only

- [ ] **Step 1: Verify the skill is listed**

In Claude Code, type `/` and confirm `/sync-docs` appears in the skill list. If this plan is being executed inside Claude Code, the skill directory was just created — Claude Code's live change detection should pick it up without restart.

If it doesn't appear:
```bash
ls .claude/skills/sync-docs/SKILL.md
cat .claude/skills/sync-docs/SKILL.md | head -10
```

Confirm the frontmatter is valid YAML and the `name: sync-docs` line is present.

- [ ] **Step 2: Verify the hooks are registered**

Type `/hooks` in Claude Code. Expected: `Stop` and `SubagentStop` both show 1 hook each.

- [ ] **Step 3: Verify the pre-commit wiring**

Run:
```bash
ls -la .husky/
```

Expected: both `pre-commit` and `check-docs-sync.sh` exist with execute permissions.

- [ ] **Step 4: Dry-run pre-commit scenario — no staged files**

```bash
sh .husky/check-docs-sync.sh
echo "Exit: $?"
```

Expected: `Exit: 0` with no output (or exit 0 after no warning).

- [ ] **Step 5: Dry-run pre-commit scenario — staged code without docs**

```bash
# Stage a minor code change
git diff --name-only src/ | head -1
```

If there are already code-only changes, stage one:
```bash
# Pick any src file that has changes but isn't committed yet
FILE=$(git diff --name-only src/ | head -1)
if [ -n "$FILE" ]; then
  git add "$FILE"
  sh .husky/check-docs-sync.sh
  echo "Exit: $?"
  # Unstage to avoid accidentally committing
  git reset HEAD "$FILE"
fi
```

Expected: warning message prints and `Exit: 1`.

- [ ] **Step 6: Confirm nothing was auto-committed during verification**

```bash
git status
```

Expected: the repository is in the state you expect — only the intentional commits from Tasks 1–6 are present, and no code files were unintentionally staged.

---

## Task 8: Run `/sync-docs` to sync current branch's docs

**Files:**
- This task runs the newly built system against the existing `fix/error-redesign` branch changes.

- [ ] **Step 1: Inspect current branch state**

Run:
```bash
git status --short
git log --oneline -5
```

Note all uncommitted code changes in `src/errors/`, `src/common/`, `src/modules/` etc.

- [ ] **Step 2: Invoke the skill**

In Claude Code, type:
```
/sync-docs
```

- [ ] **Step 3: Review the skill's output**

The skill should print its structured summary. Review:
- **Created** files — are the new docs justified by actual new code?
- **Updated** files — do the edits accurately reflect code changes?
- **Archived** files — is archival warranted?
- **Flagged for manual review** — open each flagged diagram and verify visual accuracy

- [ ] **Step 4: Review changes with `git diff`**

```bash
git status --short
git diff
```

Expected: doc files under `docs/`, potentially `CLAUDE.md`, and archival moves appear. Nothing under `src/` should be modified.

- [ ] **Step 5: Manually verify flagged diagrams**

For each file listed under "Flagged for manual review", open it and check:
- Diagram syntax is valid (Mermaid renders, ASCII aligns)
- Visual meaning matches code reality
- Remove the `<!-- DOC-SYNC: Diagram updated on YYYY-MM-DD... -->` comment once verified

- [ ] **Step 6: Commit the doc updates**

```bash
git add docs/ CLAUDE.md
# If archival happened, also add the moves:
git add docs/archival/
git commit -m "docs: sync documentation with error-redesign code changes"
```

The pre-commit hook should pass because doc files are now staged.

---

## Self-Review Checklist

Already performed inline during plan creation:

**Spec coverage:**
- ✅ Component 1 (skill) → Task 2
- ✅ Component 2 (Stop hook) → Task 3
- ✅ Component 3 (SubagentStop hook) → Task 3 (same file)
- ✅ Component 4 (pre-commit) → Tasks 4, 5, 6
- ✅ Archival folder creation → Task 1
- ✅ End-to-end verification → Task 7
- ✅ First real run → Task 8

**Placeholder scan:** No TBD/TODO/"implement later"/"similar to Task N" references. Each task has complete code and commands.

**Consistency:**
- Skill name `sync-docs` used consistently
- Hook event names `Stop` / `SubagentStop` match Claude Code docs
- Bash matcher prefixes `Bash(git diff*)` etc. match Claude Code permission syntax
- The Stop and SubagentStop hook prompts are identical (intentional duplication per spec)
- `SKIP_DOC_CHECK=1` bypass syntax consistent across spec, script, and plan
