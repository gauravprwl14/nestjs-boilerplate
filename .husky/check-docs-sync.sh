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
CODE_FILES=$(echo "$STAGED" | grep -E '^(src/|test/|prisma/schema\.prisma$|package\.json$|tsconfig\.json$|nest-cli\.json$|docker-compose\.yml$)' || true)
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
