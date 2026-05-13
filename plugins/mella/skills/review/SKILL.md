---
name: review
description: Use this skill any time a user wants their code, diff, or branch reviewed before committing, pushing, or opening a PR. Triggers on: "check my changes", "look over my diff", "review this before I merge", "take a look at my branch", "anything look off?", "second set of eyes", "review PR #N", checking commits just pushed, or pre-PR sanity checks. Runs all installed review skills (security, code quality, simplification) in parallel and consolidates findings into one actionable report. Use for code review intent — not for git help, writing PR descriptions, or explaining diffs.
when_to_use: "review my code, check my changes, pre-PR review, before committing, before creating a PR, check for issues, run a code review, look over my diff, review this PR"
argument-hint: "[--sequential] [--force] [PR#]"
context: fork
model: opus
effort: xhigh
allowed-tools: Bash Read Edit Write Grep Glob Skill Agent TaskCreate TaskGet TaskList TaskOutput TaskStop TaskUpdate
---

# /review Skill

No skills are skipped based on diff content. Only hard gates apply: PR required, Laravel required, not installed.

## Step 0 — Plan mode guard

If in plan mode: stop. Tell the user to exit plan mode first — Edit/Write are required.

## Step 1 — Gather context

```bash
git branch --show-current
git diff main...HEAD 2>/dev/null || git diff master...HEAD 2>/dev/null || git diff HEAD~1
git diff
git diff --cached
git rev-parse HEAD
gh pr view --json number,url,title,body 2>/dev/null || echo "NO_PR"
test -f artisan && echo "LARAVEL" || (cat composer.json 2>/dev/null | grep -q '"laravel/framework"' && echo "LARAVEL" || echo "NOT_LARAVEL")
```

- On `main`/`master` without `--force`: warn and stop.
- On `main`/`master` with `--force`: use `HEAD~1` as diff base.
- No changes at all: tell user and stop.
- `HAS_PR`: true if `gh pr view` returned a valid number, or a PR# was passed as argument.
- `IS_LARAVEL`: true if `artisan` exists or `laravel/framework` in `composer.json`.
- `IS_SEQUENTIAL`: true if the literal string `--sequential` appears anywhere in the arguments this skill was invoked with.

## Step 2 — Probe installed skills

```bash
find ~/.claude/plugins/cache -name "review-pr.md" -path "*/commands/*" 2>/dev/null | head -1
find ~/.claude/plugins/cache -name "code-review.md" -path "*/commands/*" 2>/dev/null | head -1
find ~/.claude/plugins/cache -name "code-simplifier.md" -path "*/agents/*" 2>/dev/null | head -1
find ~/.claude/plugins/cache -name "SKILL.md" -path "*laravel*best*" 2>/dev/null | head -1
```

`security-review` and `simplify` are always available — skip probing them.

Build the roster from results. Then apply gates:
- Drop `pr-review-toolkit:review-pr` and `code-review:code-review` if `HAS_PR=false`
- Drop `laravel-best-practices` if `IS_LARAVEL=false`
- Drop any probed skill with no probe result

## Step 3 — Announce

Print Mode (PR #N or local), Project (Laravel/Non-Laravel), Execution (Parallel / Sequential), Phase 1 skill list with ✓/⊘ per entry and reason for any skip, Phase 2 list. Then proceed — no confirmation needed.

## Step 4 — Phase 1: Analytical review

Invoke only the Phase 1 skills that survived Step 2 gates: `security-review`, `pr-review-toolkit:review-pr`, `code-review:code-review`, `laravel-best-practices`. All are invoked via **Skill tool**.

**If IS_SEQUENTIAL=false (default — parallel):** Invoke all surviving Phase 1 skills as simultaneous Skill tool calls in a single response turn.

**If IS_SEQUENTIAL=true:** Invoke each one at a time, awaiting full completion before starting the next, in this order:
1. `security-review`
2. `pr-review-toolkit:review-pr`
3. `code-review:code-review`
4. `laravel-best-practices`

`simplify` and `code-simplifier` are Phase 2 — do not invoke here. On failure: note and continue.

## Step 4.5 — Verify completeness

Check that every roster Phase 1 skill was actually invoked via the Skill tool — not just mentioned or analyzed inline. Invoke any missing ones now. (This step prevents accidental hallucination of completion without real tool calls.)

## Step 5 — Phase 2: Code-editor skills (staged findings)

Phase 2 tools edit files — they always run sequentially, regardless of IS_SEQUENTIAL, because concurrent file edits would create git state conflicts between invocations. Capture changes per-file; present as APPLIED findings the user can revert.

```bash
git diff --name-only HEAD; git diff --name-only --cached   # BEFORE_FILES
```

**1. `simplify`** — invoke via Skill, then:
```bash
git diff --name-only HEAD; git diff --name-only --cached   # AFTER_S_FILES
```
New/changed files vs `BEFORE_FILES` → attributed to simplify. For each: `git diff HEAD -- <file>`. IDs: `p2_s_1`, `p2_s_2`, ...

**2. `code-simplifier:code-simplifier`** (if in roster) — invoke via Agent, then:
```bash
git diff --name-only HEAD; git diff --name-only --cached   # AFTER_CS_FILES
```
New/changed files vs `AFTER_S_FILES` → attributed to code-simplifier. For each: `git diff HEAD -- <file>`. IDs: `p2_cs_1`, `p2_cs_2`, ...

## Step 6 — Consolidate

- **Dedup**: merge Phase 1 findings that overlap on the same file+line range; keep most detailed, list all agreeing skills.
- **Conflicts**: contradictory advice on the same location → `⚠️ CONFLICT`.
- **Severity** (Phase 1): 3+ skills = CRITICAL, 2 = HIGH, 1 = MEDIUM. Any security finding = CRITICAL. Phase 2 findings = LOW.
- **Normalize** each finding: ID · Status (PENDING/APPLIED) · Severity · File:Line · Issue · Skills · Action

## Step 7 — Report

**Section 1** — Run summary: skills run, skipped (with reason), failures.

**Section 2** — Conflicts (if any): table of `File:Line | Skill A says | Skill B says`.

**Section 3** — Findings table: `ID | Status | Sev | File:Line | Issue | Skills | Action`. Sort: CRITICAL first, by file, Phase 2 at bottom.

**Section 4** — Stats: totals by severity and by skill.

## Step 8 — Await instructions

Use AskUserQuestion (`Header: "Next step"`, `Question: "How would you like to proceed?"`):
1. Apply all — apply all PENDING non-conflicting; Phase 2 changes kept
2. Done / Stop — exit; Phase 2 changes remain in working tree
3. (if conflicts) Resolve conflicts first

Handle responses:
- `apply all` → all PENDING, ask per conflict
- `fix/apply f1,f4` → those IDs only
- `revert p2_*` → `git checkout -- <file>`
- `dismiss/ignore fN` → skip
- `done/stop` → exit; warn Phase 2 changes remain

## Step 9 — Apply fixes

For approved PENDING findings: read → edit → write. On failure: report, continue.

For Phase 2 reverts: `git checkout -- <file>`. If Phase 1 fixes also touch that file, re-apply them after the revert.

Summarize all changes. Remind user of any unapplied PENDING findings.
