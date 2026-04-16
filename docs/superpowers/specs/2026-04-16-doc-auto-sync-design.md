# Doc Auto-Sync System — Design Spec

**Date:** 2026-04-16
**Status:** Approved design, ready for implementation planning
**Branch context:** Proposed for integration on `main` after current branch work completes

---

## Problem

Documentation drift is a constant problem in active codebases. When code changes, the following docs may all be impacted simultaneously:

- Coding guidelines (e.g., error handling, module organization)
- Architecture docs (high-level, service, database design)
- Feature guides (`FOR-Authentication.md`, `FOR-Observability.md`, etc.)
- Sequence diagrams (auth flow, error handling, observability pipeline)
- PRDs and business use cases
- `CLAUDE.md` router (folder map, routing table, coding conventions)
- `docs/CONTEXT.md` and sub-folder `CONTEXT.md` files
- Deployment checklists and infrastructure docs

Today, doc updates are entirely manual. Developers forget. Context decays. New hires inherit stale docs. The AI-native goals of this project — where Claude loads docs as context — only work if those docs reflect reality.

This spec describes an autonomous doc-sync system that detects code changes, reasons about which docs are affected across all layers, and updates them automatically while requiring user review before anything lands in git.

## Goals

1. **Autonomous** — No manually maintained mapping file between code and docs. The system uses LLM judgment to determine impact across all docs.
2. **Holistic** — A single code change may impact multiple doc types (PRD, architecture, sequence diagrams, guides, routers). The system updates all affected files, not just "the corresponding guide."
3. **Mode-agnostic** — Works across main Claude Code sessions, subagents, worktrees, plan mode, and manual edits outside Claude.
4. **Safe** — Never auto-commits. Never deletes. Flags risky changes (diagrams) for manual review.
5. **3-layer aware** — Maintains Router (Layer 1), Room (Layer 2), and Output (Layer 3) integrity per the documented workspace architecture.
6. **Cost-efficient** — Lightweight gates on every response, heavy work only when triggered.

## Non-Goals

- Swagger/OpenAPI generation — handled declaratively by NestJS decorators at the controller level.
- Scheduled/cron-based sync — purely event-driven.
- Cross-project sync — scoped to this repo only.
- Auto-commit after sync — user always reviews changes via `git diff`.
- A mapping configuration file between code paths and doc paths.

## Architecture Overview

The system has four components working together:

| Component | Location | Type | Fires When |
|-----------|----------|------|------------|
| `/sync-docs` skill | `.claude/skills/sync-docs/SKILL.md` | Forked subagent skill | Manual invocation or Claude auto-invokes |
| `Stop` hook | `.claude/settings.json` | `type: "prompt"` (Haiku) | After every main-session Claude response |
| `SubagentStop` hook | `.claude/settings.json` | `type: "prompt"` (Haiku) | After any subagent/worktree completes |
| Pre-commit check | `.husky/check-docs-sync.sh` | Shell script | During `git commit` |

### Flow Diagram

```
Code changes happen (any mode)
        |
        v
Stop / SubagentStop hook (prompt gate, ~2s)
        |
   "Did code change?"
   /             \
  No              Yes
  |                |
  done         Inject reminder:
               "Docs may be stale.
                Run /sync-docs"
                     |
                     v
         User runs /sync-docs (or Claude auto-invokes)
                     |
                     v
         Forked subagent:
           - git diff
           - scan ALL docs
           - update stale content
           - create new docs if needed
           - archive obsolete docs
           - flag diagrams for review
                     |
                     v
         Prints summary (created / updated / archived / flagged)
                     |
                     v
         User reviews unstaged changes, commits manually
                     |
                     v
         Pre-commit hook: warns if code staged but no docs staged
                     |
                     v
         Commit succeeds (or user bypasses with SKIP_DOC_CHECK=1)
```

---

## Component 1: `/sync-docs` Skill

**Path:** `.claude/skills/sync-docs/SKILL.md`

**Frontmatter:**

```yaml
---
name: sync-docs
description: Sync all documentation with recent code changes. Use when code changes have been made and docs may be stale — detects changes via git diff, updates affected docs across all layers (PRD, architecture, guides, diagrams, CLAUDE.md, CONTEXT.md files), creates new docs for new modules, archives obsolete docs, and flags diagrams for manual review. Does not commit changes.
context: fork
agent: general-purpose
allowed-tools: Read Grep Glob Edit Write Bash(git diff*) Bash(git status*) Bash(git log*) Bash(mkdir -p *) Bash(mv *)
argument-hint: [--branch <name>]
---
```

**Behavior (SKILL.md body instructions to the subagent):**

1. **Detect what changed**
   - Default: `git diff --name-only HEAD` plus `git diff --name-only --cached` (both staged and unstaged)
   - If `--branch <name>` argument is provided: `git diff --name-only <name>...HEAD`
   - Classify into:
     - **Code files:** `src/**`, `prisma/schema.prisma`, `test/**`, config files at root
     - **Doc files:** `docs/**`, `CLAUDE.md`, `AGENTS.md`, root `*.md`
     - **Other:** ignore
   - If no code files changed, exit with message "No code changes detected. Nothing to sync."

2. **Read the actual code diffs**
   - For each changed code file, run `git diff HEAD -- <path>` to see what changed semantically
   - Note: additions (new functions/classes/modules), deletions (removed code), modifications (signature/behavior changes)

3. **Scan all documentation**
   - Use `Glob` to enumerate all docs: `docs/**/*.md`, `CLAUDE.md`, root `*.md`
   - For each doc, read it fully and ask: "Does any content here reference, describe, or depend on something that changed in the code diff?"
   - Build an impact list: `{ docPath: string, sections: string[], reason: string }`

4. **Update stale docs**
   - For each impacted doc, use `Edit` to update specific sections
   - **Preserve:** tone, structure, prose style, unrelated content
   - **Update:** only the parts that are now factually wrong or incomplete
   - Apply across all 3 layers:
     - **Layer 1 (Router):** `CLAUDE.md` folder map, routing table, coding conventions, error system, controller decorators, logger contract, API versioning
     - **Layer 2 (Room):** `docs/CONTEXT.md`, sub-folder `CONTEXT.md` files, `docs/coding-guidelines/*.md`, `docs/guides/FOR-*.md`
     - **Layer 3 (Output):** `docs/architecture/*.md`, `docs/diagrams/*.md`, `docs/prd/*.md`, `docs/infrastructure/*.md`, `docs/assumptions/*.md`

5. **Create new docs when needed**
   - If a new module is added under `src/modules/`, create `docs/guides/FOR-<ModuleName>.md` following the structure of existing guides
   - If new architectural concepts are introduced, create the appropriate architecture doc
   - Update Layer 1/2 routers (`CLAUDE.md`, `docs/CONTEXT.md`) to include the new docs
   - Listed under **Created** in the summary

6. **Archive obsolete docs (never delete)**
   - If a doc describes code that no longer exists:
     - Create `docs/archival/` if it doesn't exist (`mkdir -p docs/archival`)
     - Move the file with date prefix: `git mv docs/path/file.md docs/archival/YYYY-MM-DD_file.md`
     - Update Layer 1/2 routers to remove references
     - Listed under **Archived** in the summary with reason
   - User reviews and decides whether to delete permanently or restore

7. **Update diagrams and flag for review**
   - Update Mermaid / ASCII art / sequence diagrams to reflect new code reality
   - Append a comment to the diagram file:
     ```
     <!-- DOC-SYNC: Diagram updated on YYYY-MM-DD. Please verify visual accuracy before committing. -->
     ```
   - Listed under **Flagged for manual review** in the summary

8. **Print structured summary**

   ```
   ## Doc Sync Summary

   ### Created (N files)
   - <path> — <reason>

   ### Updated (N files)
   - <path> — <what changed>

   ### Archived (N files)
   - <old-path> -> <new-path>
     Reason: <why>
     Action needed: Review and confirm deletion, or restore if needed

   ### Flagged for manual review (N files)
   - <path> — <reason>

   ### No changes needed (N files scanned)

   Changes are unstaged. Review with `git diff` before committing.
   ```

**Hard constraints (MUST NOT):**
- MUST NOT run `git add`, `git commit`, `git push`, or any staging operation
- MUST NOT delete files (use archival pattern)
- MUST NOT rewrite entire docs — preserve existing prose where still accurate
- MUST NOT create docs outside `docs/` or root-level markdown
- MUST NOT modify code files under `src/` (doc-sync only touches docs)

---

## Component 2: `Stop` Hook (Main Session Gate)

**Path:** `.claude/settings.json` (project-level, committed)

**Purpose:** After every main-session Claude response, cheaply detect if code changed and inject a reminder to run `/sync-docs`.

**Configuration:**

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
    ]
  }
}
```

**Infinite-loop prevention:** Honors `stop_hook_active` field per Claude Code docs. If `true`, returns `{"ok": true}` immediately.

**Cost profile:** Single Haiku call per response, ~2s latency. Runs only when a response ends (not per tool call).

**Failure mode:** If the prompt hook times out or fails, the hook exits silently allowing Claude to stop normally. This is fail-open by design — the doc-sync system should never block Claude.

---

## Component 3: `SubagentStop` Hook (Subagent & Worktree Gate)

**Path:** `.claude/settings.json` (same file as Stop hook)

**Purpose:** Same gate logic, fires when a subagent or worktree-based agent completes. This covers the `Plan`, `Explore`, `general-purpose`, and any custom subagent lifecycles, including those spawned via `isolation: "worktree"`.

**Configuration:**

```json
{
  "hooks": {
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

Note: the prompt body is intentionally duplicated from the `Stop` hook to keep each hook configuration self-contained and independently editable. If future refactoring wants DRY, the prompt could be extracted to a shared script file and both hooks could use `type: "command"` to call it.

---

## Component 4: Pre-commit Doc-Sync Check

**Path:** `.husky/check-docs-sync.sh` (new file)
**Integration:** Extends `.husky/pre-commit`

### Updated `.husky/pre-commit`

```sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Existing: lint-staged runs first so formatting/linting always applies
npx lint-staged

# New: doc-sync check (runs after lint-staged)
"$(dirname -- "$0")/check-docs-sync.sh"
```

### New `.husky/check-docs-sync.sh`

```sh
#!/usr/bin/env sh
# Doc-sync pre-commit check
# Warns if code files are staged without any accompanying doc changes.

# Escape hatches
if [ "${SKIP_DOC_CHECK:-0}" = "1" ]; then
  exit 0
fi

# Check commit message for bypass flag (COMMIT_EDITMSG path during commit)
COMMIT_MSG_FILE=".git/COMMIT_EDITMSG"
if [ -f "$COMMIT_MSG_FILE" ] && grep -q "\[skip-doc-check\]" "$COMMIT_MSG_FILE" 2>/dev/null; then
  exit 0
fi

# Get staged files
STAGED=$(git diff --cached --name-only)

# Classify
CODE_FILES=$(echo "$STAGED" | grep -E '^(src/|prisma/schema\.prisma$)' || true)
DOC_FILES=$(echo "$STAGED" | grep -E '^(docs/|CLAUDE\.md$|AGENTS\.md$|[^/]+\.md$)' || true)

# No code files -> nothing to check
if [ -z "$CODE_FILES" ]; then
  exit 0
fi

# Code files AND doc files -> assume sync was done
if [ -n "$DOC_FILES" ]; then
  exit 0
fi

# Code files but NO doc files -> warn
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

**Permissions update required:** Add to `.claude/settings.local.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(printf 'npx lint-staged\\n')",
      "Bash(printf 'npx --no-- commitlint --edit \"$1\"\\n')",
      "Bash(sh .husky/check-docs-sync.sh)"
    ]
  }
}
```

---

## Cross-Mode Behavior Matrix

| Scenario | Stop Hook | SubagentStop | Pre-commit | User Action |
|----------|-----------|--------------|------------|-------------|
| Normal session editing code | Fires, reminds | — | Warns if docs stale | Run `/sync-docs` when reminded |
| Plan mode (no file changes) | Fires, silent (no code change) | — | — | Nothing |
| Subagent delegation | Fires on parent response | Fires on subagent end | Warns if stale | Run `/sync-docs` |
| Git worktree (isolation) | Fires in worktree session | Fires on worktree exit | Warns if stale | Works like main |
| Manual edit outside Claude | N/A | N/A | Warns at commit | Run `/sync-docs` or bypass |
| CI / bulk refactor | — | — | Use `SKIP_DOC_CHECK=1` | Explicit bypass |

---

## Observability

- **Hook debug logs:** `claude --debug-file /tmp/claude.log` captures all hook executions
- **Skill summary:** `/sync-docs` prints its full structured summary to the conversation — permanent audit trail
- **Archived files:** Retain original content with date prefix — recoverable via `git mv`
- **Git history:** All doc changes go through normal `git diff` review before commit

---

## Rollout Plan

This section describes ordering only; the actual implementation plan is separate (written by `writing-plans` skill next).

1. Build and test `/sync-docs` skill in isolation (manual invocation only)
2. Add `Stop` hook configuration
3. Add `SubagentStop` hook configuration
4. Add `.husky/check-docs-sync.sh` and update `.husky/pre-commit`
5. Add permissions to `.claude/settings.local.json`
6. Run an end-to-end test: make a trivial code change, verify the full flow
7. Commit the skill, hooks, and pre-commit script together

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `/sync-docs` over-edits and corrupts good docs | User reviews all changes via `git diff` before commit; never auto-commits |
| Diagram updates are visually wrong | Every diagram change is flagged with `<!-- DOC-SYNC -->` comment for manual review |
| Stop hook creates infinite loops | `stop_hook_active` check returns `{"ok": true}` early on continuation |
| Haiku prompt occasionally misclassifies | Fail-open: if the hook fails, Claude stops normally; pre-commit is the safety net |
| Pre-commit blocks legitimate quick commits | Three bypass mechanisms: `SKIP_DOC_CHECK=1`, `[skip-doc-check]` in message, `--no-verify` |
| Costs add up on long sessions | `Stop` gate is a single Haiku call (~2s); heavy work only runs on manual `/sync-docs` |
| Forked subagent loses main-session context | By design — the skill operates purely on `git diff`, not conversation memory |
| Archived file is actually still needed | File is preserved in `docs/archival/` with original content; `git mv` restores it |

---

## Success Criteria

The system is considered working when:

1. After adding a new module, running `/sync-docs` updates `CLAUDE.md` folder map and creates `docs/guides/FOR-<Module>.md`
2. After modifying an error code file, running `/sync-docs` updates `docs/coding-guidelines/07-error-handling.md`, `docs/guides/FOR-Error-Handling.md`, `CLAUDE.md` error system section, and `docs/diagrams/error-handling-flow.md` (with review flag)
3. After removing a module, running `/sync-docs` moves the corresponding doc to `docs/archival/`
4. Committing code without doc updates produces the pre-commit warning
5. `SKIP_DOC_CHECK=1 git commit` bypasses the warning cleanly
6. The `Stop` hook adds ~2s or less to response time when no code changed, and correctly reminds the user when code did change
7. Works identically in main session, subagent, and worktree scenarios

---

## Open Questions for Implementation

None at design time. All questions from brainstorming have been resolved:
- Scope: code ↔ all docs bidirectionally (A + B focus, C handled by decorators)
- Triggers: hybrid (automatic reminders + manual skill + pre-commit safety net)
- Mapping: none — autonomous LLM judgment
- Auto-apply: yes, with user review before commit
- New docs: yes, created when needed
- Deletion: archived instead, user confirms deletion
- Diagrams: updated and flagged for manual review
- Commit: never automatic
