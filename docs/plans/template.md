# Plan N — <Title>

> Copy this template as `plan-N-<slug>.md`. Replace all `<placeholders>`.

## Overview

**Goal:** One sentence describing what this plan delivers.
**Branch:** `plan-N-<slug>`
**Status:** Draft | In Progress | Done

---

## Background

Why is this plan needed? What problem does it solve?
Link to the relevant PRD section or task-tracker item.

---

## Scope

### In Scope

- Item 1
- Item 2

### Out of Scope

- Item that will be deferred

---

## Technical Design

Describe the approach. Include:
- Which modules are affected
- New files to create (with path and purpose)
- Files to modify
- Any schema migrations needed
- Any new environment variables

---

## Implementation Steps

1. **Step name** — Description of what to do. Files: `path/to/file.ts`
2. **Step name** — ...
3. ...

---

## Testing Plan

- [ ] Unit tests for `<ServiceName>.<method>`
- [ ] E2E test for `<METHOD> /<endpoint>`
- [ ] Manual smoke test: describe the manual verification steps

---

## Rollout / Commit Strategy

| Commit | Message |
|--------|---------|
| 1 | `feat(<scope>): <description>` |
| 2 | `test(<scope>): add unit tests for ...` |

---

## Definition of Done

- [ ] All implementation steps complete
- [ ] All tests pass (`npm run test && npm run test:e2e`)
- [ ] No TypeScript errors (`npm run type:check`)
- [ ] No lint errors (`npm run lint`)
- [ ] Documentation updated if API surface changed
- [ ] Task tracker updated in `docs/task-tracker/project-status.md`
