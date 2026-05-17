---
name: audit
description: Use this skill any time a user wants their code, diff, or branch reviewed before committing, pushing, or opening a PR. Triggers on: "check my changes", "look over my diff", "review this before I merge", "take a look at my branch", "anything look off?", "second set of eyes", "review PR #N", checking commits just pushed, or pre-PR sanity checks. Runs all installed review skills (security, code quality, simplification) in parallel and consolidates findings into one actionable report. Use for code review intent — not for git help, writing PR descriptions, or explaining diffs.
when_to_use: "review my code, check my changes, pre-PR review, before committing, before creating a PR, check for issues, run a code review, look over my diff, review this PR"
argument-hint: "[--sequential] [--force] [PR#]"
model: opus
effort: xhigh
allowed-tools: Bash Read Edit Write Grep Glob Skill Agent TaskCreate TaskGet TaskList TaskOutput TaskStop TaskUpdate
---

# /audit Skill

Comprehensive code review across installed review skills. Hard gates use Bash exit codes (cannot be skipped by skim-reading). Phase 1 skills are dispatched as explicit per-skill Agent calls (one tool call per skill, fully enumerated — no abstract "invoke in parallel" prose).

## Step 0 — Plan mode guard

If in plan mode: STOP. Tell the user to exit plan mode first — Edit/Write are required downstream.

## Step 1 — Parse arguments

Read this skill's invocation arguments. Set these booleans before any tool call:

- `IS_SEQUENTIAL` — true iff the literal token `--sequential` appears in the arguments.
- `IS_FORCE` — true iff the literal token `--force` appears in the arguments.
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
CODE_SIMPLIFIER_PROBE=$(find ~/.claude/plugins/cache -name "code-simplifier.md" -path "*/agents/*" 2>/dev/null | head -1)
LARAVEL_BEST_PROBE=$(find ~/.claude/plugins/cache -name "SKILL.md" -path "*laravel*best*" 2>/dev/null | head -1)

echo "PR_REVIEW=${PR_REVIEW_PROBE:-NONE}"
echo "CODE_SIMPLIFIER=${CODE_SIMPLIFIER_PROBE:-NONE}"
echo "LARAVEL_BEST=${LARAVEL_BEST_PROBE:-NONE}"
```

## Step 4 — Build roster

Phase 1 roster (always-included plus gated additions):
- `security-review` (always)
- `pr-review-toolkit:review-pr` — include iff `PR_REVIEW != NONE` AND `HAS_PR=1`
- `laravel-best-practices` — include iff `LARAVEL_BEST != NONE` AND `IS_LARAVEL=1`

`code-review:code-review` (the official Anthropic plugin) is deliberately NOT in the roster. It posts a `gh pr comment` on every run with no dry-run mode, which is too intrusive for an audit. Run it manually via `/code-review:code-review` when you actually want a PR comment posted.

Phase 2 roster:
- `simplify` (always)
- `code-simplifier:code-simplifier` — include iff `CODE_SIMPLIFIER != NONE`

## Step 5 — Create task tracker

Use TaskCreate to create one task per roster entry. Subjects exactly:
- `P1: security-review`
- `P1: pr-review-toolkit:review-pr` (only if in roster)
- `P1: laravel-best-practices` (only if in roster)
- `P2: simplify`
- `P2: code-simplifier:code-simplifier` (only if in roster)

You will mark each task `completed` after its dispatch returns. Step 8 verifies all P1 tasks are completed before allowing Phase 2 to start.

## Step 6 — Announce

Tell the user:
- Branch: `<BRANCH>`
- Diff base: `<DIFF_BASE>`
- PR mode: yes (URL) / no
- Project: Laravel / Non-Laravel
- Execution: Parallel / Sequential
- Phase 1 roster: list each entry
- Phase 2 roster: list each entry

Then proceed immediately — no confirmation needed.

## Step 7 — Phase 1: per-skill Agent dispatches

For EACH Phase 1 roster entry, emit one Agent tool call. The instruction blocks below give the exact prompt for each. Skip blocks for entries not in the roster.

- **If `IS_SEQUENTIAL=false` (default — parallel):** emit all in-roster Agent calls in a single response turn as parallel tool_use blocks.
- **If `IS_SEQUENTIAL=true`:** emit one Agent call, wait for completion, then the next, in roster order.

### 7a. security-review (always in roster)

Tool: Agent
description: "security-review on current diff"
subagent_type: "general-purpose"
prompt:
> You are dispatched to invoke exactly one skill and return its output. Do not run any other analysis. Do not invoke other tools beyond what the skill needs.
>
> Invoke: `Skill(skill="security-review")`.
>
> When it returns, output its complete findings verbatim. Preserve file:line citations and severity labels. Do not introduce, summarize, or editorialize.

After it returns, mark `P1: security-review` task completed.

### 7b. pr-review-toolkit:review-pr (if in roster)

Tool: Agent
description: "pr-review-toolkit:review-pr on current PR"
subagent_type: "general-purpose"
prompt:
> You are dispatched to invoke exactly one skill and return its output. Do not run any other analysis. Do not invoke other tools beyond what the skill needs.
>
> Invoke: `Skill(skill="pr-review-toolkit:review-pr")`.
>
> When it returns, output its complete findings verbatim. Preserve file:line citations and severity labels. Do not introduce, summarize, or editorialize.

After it returns, mark `P1: pr-review-toolkit:review-pr` task completed.

### 7c. laravel-best-practices (if in roster)

Tool: Agent
description: "laravel-best-practices on current diff"
subagent_type: "general-purpose"
prompt:
> You are dispatched to invoke exactly one skill and return its output. Do not run any other analysis. Do not invoke other tools beyond what the skill needs.
>
> Invoke: `Skill(skill="laravel-best-practices")`.
>
> When it returns, output its complete findings verbatim. Preserve file:line citations and severity labels. Do not introduce, summarize, or editorialize.

After it returns, mark `P1: laravel-best-practices` task completed.

## Step 8 — Verify Phase 1 completeness

Call TaskList. Every `P1:` task must have status `completed`. If any P1 task is still `pending` or `in_progress`:
1. Identify which entry didn't complete.
2. Re-dispatch its Agent from Step 7 (sequential this time, regardless of `IS_SEQUENTIAL`).
3. Mark its task completed.

DO NOT proceed to Step 9 until every P1 task in the tracker is `completed`. This step exists specifically to catch agents that short-circuited Step 7 and emitted fewer parallel Agent calls than the roster called for.

## Step 9 — Phase 2: code-editor skills (always sequential)

Phase 2 skills edit files. Always sequential to prevent git-state conflicts between them.

Capture baseline file list:
```bash
git diff --name-only HEAD
git diff --name-only --cached
```
Save this as `BEFORE_FILES`.

### 9a. simplify (always in Phase 2 roster)

Tool: Agent
description: "simplify on current diff"
subagent_type: "general-purpose"
prompt:
> You are dispatched to invoke exactly one skill and return its output. The skill may edit files in the working tree; allow it to. Do not run additional analysis or edits.
>
> Invoke: `Skill(skill="simplify")`.
>
> When it returns, output its complete textual findings verbatim AND list every file path it edited. Preserve file:line citations.

After it returns, capture new file list:
```bash
git diff --name-only HEAD
git diff --name-only --cached
```
Save this as `AFTER_S_FILES`. Files in `AFTER_S_FILES` not in `BEFORE_FILES` (or whose `git diff HEAD -- <file>` content changed vs baseline) are attributed to simplify. For each: capture `git diff HEAD -- <file>`. Assign IDs `p2_s_1`, `p2_s_2`, ...

Mark `P2: simplify` task completed.

### 9b. code-simplifier:code-simplifier (if in roster)

Tool: Agent
description: "code-simplifier on current diff"
subagent_type: "code-simplifier:code-simplifier"
prompt:
> Run your standard code-simplification analysis on the working-tree diff and apply any safe simplifications. Return both findings and a list of files you edited.

After it returns, capture new file list:
```bash
git diff --name-only HEAD
git diff --name-only --cached
```
Save this as `AFTER_CS_FILES`. Files in `AFTER_CS_FILES` not in `AFTER_S_FILES` (or whose `git diff HEAD -- <file>` content changed vs `AFTER_S_FILES`) are attributed to code-simplifier. For each: capture `git diff HEAD -- <file>`. Assign IDs `p2_cs_1`, `p2_cs_2`, ...

Mark `P2: code-simplifier:code-simplifier` task completed.

## Step 10 — Consolidate

- **Dedup:** merge Phase 1 findings overlapping on the same file+line range. Keep the most detailed one; list all skills that agreed.
- **Conflicts:** contradictory advice on the same location → `⚠️ CONFLICT`.
- **Severity (Phase 1):** 3+ skills agree = CRITICAL, 2 = HIGH, 1 = MEDIUM. Any security finding = CRITICAL. Phase 2 findings = LOW.
- **Normalize each finding:** ID · Status (PENDING/APPLIED) · Severity · File:Line · Issue · Skills · Action.

## Step 11 — Report

**Output the report as rendered Markdown, not as a code block.** Emit headings with `##`, tables as pipe tables (`| col | col |` / `| --- | --- |`), and bold/inline-code with `**…**` and `` `…` ``. Do NOT wrap the whole report — or any of its sections — inside a triple-backtick fence: that suppresses table rendering, bold, and link rendering in the client, which is what the user sees as "un-rendered Markdown". Inline backticks for file paths and identifiers are fine; whole-block fences are not.

**Section 1 — Run summary:** skills run, skills skipped (with reason), failures.

**Section 2 — Conflicts** (if any): table of `File:Line | Skill A says | Skill B says`.

**Section 3 — Findings table:** `ID | Status | Sev | File:Line | Issue | Skills | Action`. Sort: CRITICAL first, by file, Phase 2 entries at bottom.

**Section 4 — Stats:** totals by severity and by skill.

## Step 12 — Await instructions

Use AskUserQuestion (`Header: "Next step"`, `Question: "How would you like to proceed?"`):
1. Apply all — apply all PENDING non-conflicting findings; Phase 2 changes kept.
2. Done / Stop — exit; Phase 2 changes remain in working tree.
3. (only shown if conflicts) Resolve conflicts first.

Handle responses:
- `apply all` → apply all PENDING, ask per conflict.
- `fix/apply f1,f4` → those IDs only.
- `revert p2_*` → `git checkout -- <file>` for each affected file.
- `dismiss/ignore fN` → skip.
- `done/stop` → exit; warn that Phase 2 changes remain.

## Step 13 — Apply fixes

For approved PENDING findings: read → edit → write. On failure: report, continue with remaining.

For Phase 2 reverts: `git checkout -- <file>`. If Phase 1 fixes also touch that file, re-apply them after the revert.

Summarize all changes. Remind user of any unapplied PENDING findings.
