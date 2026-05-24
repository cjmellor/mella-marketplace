#!/usr/bin/env bash
# Hard gates for /audit. Called as: gates.sh <FORCE> <PR_NUMBER>
# Exits non-zero with a GATE_FAIL message on stderr if nothing to review.
# On success, prints STATE_OK + env vars for the parent skill to parse.

FORCE="${1:-0}"
PR_PASSED="${2:-}"

CURRENT=$(git branch --show-current)
HAS_TREE_CHANGES=$( { git diff --quiet && git diff --cached --quiet; } && echo 0 || echo 1 )

# Gate A: refuse main/master without --force
if [ "$CURRENT" = "main" ] || [ "$CURRENT" = "master" ]; then
  if [ "$FORCE" != "1" ]; then
    echo "GATE_FAIL: On '$CURRENT' without --force. Switch to a feature branch, or pass --force to compare HEAD~1..HEAD." >&2
    exit 2
  fi
fi

# Determine commits ahead of base
BASE_REF=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null || echo "")
if [ -n "$BASE_REF" ] && [ "$BASE_REF" != "$(git rev-parse HEAD)" ]; then
  COMMITS_AHEAD=$(git rev-list --count "$BASE_REF..HEAD" 2>/dev/null || echo 0)
else
  COMMITS_AHEAD=0
fi

# Gate B: nothing to review
if [ "$HAS_TREE_CHANGES" = "0" ] && [ "$COMMITS_AHEAD" = "0" ] && [ -z "$PR_PASSED" ]; then
  if ! gh pr view --json number >/dev/null 2>&1; then
    echo "GATE_FAIL: No working-tree changes, no commits ahead of base branch, and no PR. Nothing to review." >&2
    exit 3
  fi
fi

# Detect PR
if [ -n "$PR_PASSED" ]; then
  GH_PR=$(gh pr view "$PR_PASSED" --json number,url,title,body 2>/dev/null || echo "")
else
  GH_PR=$(gh pr view --json number,url,title,body 2>/dev/null || echo "")
fi
[ -n "$GH_PR" ] && HAS_PR=1 || HAS_PR=0

# Detect Laravel
if [ -f artisan ] || ( [ -f composer.json ] && grep -q '"laravel/framework"' composer.json ); then
  IS_LARAVEL=1
else
  IS_LARAVEL=0
fi

# Compute diff base
if [ "$FORCE" = "1" ] && { [ "$CURRENT" = "main" ] || [ "$CURRENT" = "master" ]; }; then
  DIFF_BASE="HEAD~1"
else
  DIFF_BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null || echo "HEAD~1")
fi

echo "STATE_OK"
echo "BRANCH=$CURRENT"
echo "DIFF_BASE=$DIFF_BASE"
echo "HAS_PR=$HAS_PR"
echo "IS_LARAVEL=$IS_LARAVEL"
echo "COMMITS_AHEAD=$COMMITS_AHEAD"
