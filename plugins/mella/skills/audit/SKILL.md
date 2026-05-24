---
name: audit
description: Comprehensive code review that runs all installed review skills in parallel and consolidates findings into one actionable report. Use any time a user wants their code, diff, or branch reviewed — triggers on: "check my changes", "look over my diff", "review this before I merge", "anything look off?", "second set of eyes", "review PR #N", or pre-PR sanity checks. Use for code review intent — not for git help, writing PR descriptions, or explaining diffs.
when_to_use: "review my code, check my changes, pre-PR review, before committing, before creating a PR, check for issues, run a code review, look over my diff, review this PR"
argument-hint: "[--sequential] [--force] [--effort low|medium|high|max] [PR#]"
model: opus
effort: xhigh
allowed-tools: Bash Read Grep Glob Skill Agent
---

# /audit Skill

Runs installed review skills in parallel and consolidates findings into one report. Hard gates (in `scripts/gates.sh`) use Bash exit codes — cannot be skipped by skim-reading.

## Quick start

```
/audit                  # review working-tree changes vs base branch
/audit #42              # review PR #42
/audit --effort max     # thorough review (passes --effort max to code-review)
/audit --force          # review HEAD~1..HEAD on main/master
```

## Step 0 — Plan mode guard

If in plan mode: STOP. Tell the user to exit plan mode first.

## Step 1 — Parse arguments

- `IS_SEQUENTIAL` — true iff `--sequential` appears.
- `IS_FORCE` — true iff `--force` appears.
- `EFFORT_LEVEL` — value of `--effort <level>` (`low`/`medium`/`high`/`max`); default `high`.
- `PR_NUMBER` — digits from a `#<digits>` or bare `<digits>` token; otherwise empty.

## Step 2 — Hard gates

```bash
bash scripts/gates.sh <IS_FORCE as 0|1> "<PR_NUMBER or empty>"
```

Parse stdout for `STATE_OK`, `BRANCH`, `DIFF_BASE`, `HAS_PR`, `IS_LARAVEL`, `COMMITS_AHEAD`.

**If exit code is non-zero:** STOP. Output the `GATE_FAIL` message from stderr and nothing else.

## Step 3 — Probe installed skills

```bash
PR_REVIEW_PROBE=$(find ~/.claude/plugins/cache -name "review-pr.md" -path "*/commands/*" 2>/dev/null | head -1)
LARAVEL_BEST_PROBE=$(find ~/.claude/plugins/cache -name "SKILL.md" -path "*laravel*best*" 2>/dev/null | head -1)
echo "PR_REVIEW=${PR_REVIEW_PROBE:-NONE}"
echo "LARAVEL_BEST=${LARAVEL_BEST_PROBE:-NONE}"
```

## Step 4 — Build roster

| Skill | Condition | Args |
|---|---|---|
| `security-review` | always | — |
| `code-review` (built-in) | always | `--effort <EFFORT_LEVEL>` — no `--comment` |
| `laravel-best-practices` | `LARAVEL_BEST != NONE` AND `IS_LARAVEL=1` | — |
| `pr-review-toolkit:review-pr` | `PR_REVIEW != NONE` AND `HAS_PR=1` | — |

> `code-review:code-review` (Anthropic plugin) is excluded — it posts a `gh pr comment` on every run. The built-in `code-review` above does the same analysis without posting.

## Step 5 — Announce

Tell the user: branch, diff base, PR mode, project type, execution mode, and roster. Proceed immediately.

## Step 6 — Dispatch agents

Use this prompt template for each roster entry, substituting `<SKILL>` and `<ARGS>`:

> You are dispatched to invoke exactly one skill and return its output. Do not run any other analysis.
>
> Invoke: `Skill(skill="<SKILL>"[, args="<ARGS>"])`.
>
> Output its complete findings verbatim. Preserve file:line citations and severity labels. Do not introduce, summarize, or editorialize.

Dispatch table (emit one Agent tool call per in-roster row):

| `<SKILL>` | `<ARGS>` | Agent description |
|---|---|---|
| `security-review` | — | "security-review on current diff" |
| `code-review` | `--effort <EFFORT_LEVEL>` | "code-review on current diff" |
| `laravel-best-practices` | — | "laravel-best-practices on current diff" |
| `pr-review-toolkit:review-pr` | — | "pr-review-toolkit:review-pr on current PR" |

- **Default (parallel):** emit all in-roster Agent calls in a single response turn.
- **`--sequential`:** emit one at a time in table order — broad analysis first, synthesis layer (`pr-review-toolkit`) last.

## Step 7 — Consolidate

- **Dedup:** overlapping file+line findings → keep most detailed, list agreeing skills.
- **Conflicts:** contradictory advice on same location → `⚠️ CONFLICT`.
- **Severity:** 3+ skills agree = CRITICAL · 2 = HIGH · 1 = MEDIUM · any security finding = CRITICAL.
- **Normalize:** ID · Severity · File:Line · Issue · Skills · Action.

## Step 8 — Report

Fill in and output the template in `REPORT_TEMPLATE.md`. No triple-backtick fences — they suppress table and bold rendering.

The skill ends here. The user can ask to apply specific findings directly in the conversation.
