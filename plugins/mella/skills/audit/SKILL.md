---
name: audit
description: Use this skill any time a user wants their code, diff, or branch reviewed before committing, pushing, or opening a PR. Triggers on: "check my changes", "look over my diff", "review this before I merge", "take a look at my branch", "anything look off?", "second set of eyes", "review PR #N", checking commits just pushed, or pre-PR sanity checks. Runs all installed review skills (security, code quality, code correctness) in parallel and consolidates findings into one actionable report. Use for code review intent — not for git help, writing PR descriptions, or explaining diffs.
when_to_use: "review my code, check my changes, pre-PR review, before committing, before creating a PR, check for issues, run a code review, look over my diff, review this PR"
argument-hint: "[--sequential] [--force] [--effort low|medium|high|max] [PR#]"
model: opus
effort: xhigh
allowed-tools: Bash Read Grep Glob Skill Agent
---

# /audit Skill

Comprehensive code review across installed review skills. Hard gates use Bash exit codes (cannot be skipped by skim-reading). Skills are dispatched as explicit per-skill Agent calls (one tool call per skill, fully enumerated — no abstract "invoke in parallel" prose).

## Step 0 — Plan mode guard

If in plan mode: STOP. Tell the user to exit plan mode first.

## Step 1 — Parse arguments

Read this skill's invocation arguments. Set these before any tool call:

- `IS_SEQUENTIAL` — true iff the literal token `--sequential` appears in the arguments.
- `IS_FORCE` — true iff the literal token `--force` appears in the arguments.
- `EFFORT_LEVEL` — value of `--effort <level>` if present (`low`, `medium`, `high`, or `max`); default `high`.
- `PR_NUMBER` — if a `#<digits>` or bare `<digits>` PR token appears, capture digits; otherwise empty.

## Step 2 — Hard gates (Bash; agent MUST honour exit code)

Run this Bash, substituting the boolean values from Step 1 where indicated:

```bash
FORCE=<0 or 1 from IS_FORCE>
PR_PASSED="<empty or PR_NUMBER from Step 1>"

CURRENT=$(git branch --show-current)
HAS_TREE_CHANGES=$( { git diff --quiet && git diff --cached --quiet; } && echo 0 || echo 1 )

# Gate A: refuse main/master without --force
if [ "$CURRENT" = "main" ] || [ "$CURRENT" = "master" ]; then
  if [ "$FORCE" != "1" ]; then
    echo "GATE_FAIL: On '$CURRENT' without --force. Switch to a feature branch, or pass --force to compare HEAD~1..HEAD." >&2
    exit 2
  fi
fi

# Determine commits ahead of base (main or master)
BASE_REF=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null || echo "")
if [ -n "$BASE_REF" ] && [ "$BASE_REF" != "$(git rev-parse HEAD)" ]; then
  COMMITS_AHEAD=$(git rev-list --count "$BASE_REF..HEAD" 2>/dev/null || echo 0)
else
  COMMITS_AHEAD=0
fi

# Gate B: refuse only if there's literally nothing to review:
# no tree changes, no commits ahead of base, no PR specified, no PR detected.
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
```

**If the exit code is non-zero**, STOP THIS SKILL IMMEDIATELY. Your final response must include the `GATE_FAIL` message and nothing else. Do not proceed to any later step. Do not try alternative approaches.

**If exit code is 0**, parse the `STATE_OK` block. Retain `BRANCH`, `DIFF_BASE`, `HAS_PR`, `IS_LARAVEL` for later steps. Also retain `IS_SEQUENTIAL` from Step 1.

## Step 3 — Probe installed skills (Bash)

```bash
PR_REVIEW_PROBE=$(find ~/.claude/plugins/cache -name "review-pr.md" -path "*/commands/*" 2>/dev/null | head -1)
LARAVEL_BEST_PROBE=$(find ~/.claude/plugins/cache -name "SKILL.md" -path "*laravel*best*" 2>/dev/null | head -1)

echo "PR_REVIEW=${PR_REVIEW_PROBE:-NONE}"
echo "LARAVEL_BEST=${LARAVEL_BEST_PROBE:-NONE}"
```

## Step 4 — Build roster

- `security-review` (always)
- `code-review` built-in — always included; invoke with `--effort <EFFORT_LEVEL>` (read-only, no `--comment`)
- `pr-review-toolkit:review-pr` — include iff `PR_REVIEW != NONE` AND `HAS_PR=1`
- `laravel-best-practices` — include iff `LARAVEL_BEST != NONE` AND `IS_LARAVEL=1`

> **Note:** `code-review:code-review` (the Anthropic plugin) is NOT in the roster — it posts a `gh pr comment` on every run with no dry-run mode. The built-in `code-review` skill above runs the same analysis without posting.

## Step 5 — Announce

Tell the user:
- Branch: `<BRANCH>`
- Diff base: `<DIFF_BASE>`
- PR mode: yes (URL) / no
- Project: Laravel / Non-Laravel
- Execution: Parallel / Sequential
- Roster: list each entry

Then proceed immediately — no confirmation needed.

## Step 6 — Per-skill Agent dispatches

For EACH roster entry, emit one Agent tool call. Skip blocks for entries not in the roster.

- **If `IS_SEQUENTIAL=false` (default — parallel):** emit all in-roster Agent calls in a single response turn as parallel tool_use blocks.
- **If `IS_SEQUENTIAL=true`:** emit one Agent call, wait for completion, then the next, in roster order.

### 6a. security-review (always in roster)

Tool: Agent
description: "security-review on current diff"
subagent_type: "general-purpose"
prompt:
> You are dispatched to invoke exactly one skill and return its output. Do not run any other analysis. Do not invoke other tools beyond what the skill needs.
>
> Invoke: `Skill(skill="security-review")`.
>
> When it returns, output its complete findings verbatim. Preserve file:line citations and severity labels. Do not introduce, summarize, or editorialize.

### 6b. code-review built-in (always in roster)

Tool: Agent
description: "code-review on current diff"
subagent_type: "general-purpose"
prompt:
> You are dispatched to invoke exactly one skill and return its output. Do not run any other analysis. Do not invoke other tools beyond what the skill needs.
>
> Invoke: `Skill(skill="code-review", args="--effort <EFFORT_LEVEL>")` — substitute the actual resolved effort level string, e.g. `--effort high`.
>
> When it returns, output its complete findings verbatim. Preserve file:line citations and severity labels. Do not introduce, summarize, or editorialize.

### 6c. pr-review-toolkit:review-pr (if in roster)

Tool: Agent
description: "pr-review-toolkit:review-pr on current PR"
subagent_type: "general-purpose"
prompt:
> You are dispatched to invoke exactly one skill and return its output. Do not run any other analysis. Do not invoke other tools beyond what the skill needs.
>
> Invoke: `Skill(skill="pr-review-toolkit:review-pr")`.
>
> When it returns, output its complete findings verbatim. Preserve file:line citations and severity labels. Do not introduce, summarize, or editorialize.

### 6d. laravel-best-practices (if in roster)

Tool: Agent
description: "laravel-best-practices on current diff"
subagent_type: "general-purpose"
prompt:
> You are dispatched to invoke exactly one skill and return its output. Do not run any other analysis. Do not invoke other tools beyond what the skill needs.
>
> Invoke: `Skill(skill="laravel-best-practices")`.
>
> When it returns, output its complete findings verbatim. Preserve file:line citations and severity labels. Do not introduce, summarize, or editorialize.

## Step 7 — Consolidate

- **Dedup:** merge findings overlapping on the same file+line range. Keep the most detailed one; list all skills that agreed.
- **Conflicts:** contradictory advice on the same location → `⚠️ CONFLICT`.
- **Severity:** 3+ skills agree = CRITICAL, 2 = HIGH, 1 = MEDIUM. Any security finding = CRITICAL.
- **Normalize each finding:** ID · Severity · File:Line · Issue · Skills · Action.

## Step 8 — Report

**Output the report as rendered Markdown, not as a code block.** Emit headings with `##`, tables as pipe tables (`| col | col |` / `| --- | --- |`), and bold/inline-code with `**…**` and `` `…` ``. Do NOT wrap the whole report — or any of its sections — inside a triple-backtick fence: that suppresses table rendering, bold, and link rendering in the client. Inline backticks for file paths and identifiers are fine; whole-block fences are not.

**Section 1 — Run summary:** skills run, skills skipped (with reason), failures.

**Section 2 — Conflicts** (if any): table of `File:Line | Skill A says | Skill B says`.

**Section 3 — Findings table:** `ID | Sev | File:Line | Issue | Skills | Action`. Sort: CRITICAL first, then by file.

**Section 4 — Stats:** totals by severity and by skill.

The skill ends here. The user can ask to apply specific findings directly in the conversation.
